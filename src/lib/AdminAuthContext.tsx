'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  User, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  getAuth
} from 'firebase/auth';
import { auth } from './firebase';

// Admin email whitelist - keep in sync with server-side
const ADMIN_EMAILS = [
  'whdtj74@gmail.com',
  // Add more admin emails here
];

function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email);
}

interface AdminAuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ requiresMFA: boolean; challengeId?: string; adminId?: string }>;
  logout: () => Promise<void>;
  getAuthToken: () => Promise<string | null>;
  verifyMFA: (challengeId: string, code: string) => Promise<void>;
  sessionToken: string | null;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [pendingMFARequest, setPendingMFARequest] = useState<string | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>('pending');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAdmin(user?.email ? isAdminEmail(user.email) : false);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    if (!isAdminEmail(email)) {
      throw new Error('이 이메일은 관리자 권한이 없습니다.');
    }
    
    // Generate admin ID from email
    const adminId = email.replace('@', '_').replace(/\./g, '_');
    
    // Prevent duplicate MFA requests
    const requestKey = `${email}-${Date.now()}`;
    if (pendingMFARequest) {
      throw new Error('이미 진행 중인 인증 요청이 있습니다. 잠시만 기다려주세요.');
    }
    
    try {
      setPendingMFARequest(requestKey);
      
      // First authenticate with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseToken = await userCredential.user.getIdToken();
      
      // Wait a bit if fingerprint is still pending
      let currentFingerprint = deviceFingerprint;
      if (currentFingerprint === 'pending') {
        // Wait up to 1 second for fingerprint to generate
        await new Promise(resolve => setTimeout(resolve, 100));
        currentFingerprint = deviceFingerprint;
        
        // If still pending, generate now
        if (currentFingerprint === 'pending') {
          console.warn('[AdminAuth] Fingerprint still pending after wait, generating now');
          currentFingerprint = generateDeviceFingerprint();
          setDeviceFingerprint(currentFingerprint);
        }
      }
      
      console.log('[AdminAuth] Sending MFA challenge with fingerprint:', currentFingerprint.substring(0, 10) + '...');
      
      // Initiate MFA challenge
      const response = await fetch('/api/admin/auth/mfa-challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firebaseToken}`,
        'x-device-fingerprint': currentFingerprint,
      },
      body: JSON.stringify({
        adminId,
        email,
        type: 'email'
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'MFA challenge failed');
    }
    
    const data = await response.json();
    return {
      requiresMFA: true,
      challengeId: data.challengeId,
      adminId
    };
    } finally {
      setPendingMFARequest(null);
    }
  };

  const verifyMFA = async (challengeId: string, code: string) => {
    // Ensure we have a fingerprint before verifying MFA
    let currentFingerprint = deviceFingerprint;
    if (currentFingerprint === 'pending') {
      // Regenerate fingerprint if still pending
      currentFingerprint = generateDeviceFingerprint();
      setDeviceFingerprint(currentFingerprint);
    }
    
    console.log('[AdminAuth] Sending MFA verify with fingerprint:', currentFingerprint.substring(0, 10) + '...');
    
    const response = await fetch('/api/admin/auth/mfa-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-fingerprint': currentFingerprint,
      },
      body: JSON.stringify({
        challengeId,
        code
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'MFA verification failed');
    }
    
    const data = await response.json();
    setSessionToken(data.sessionToken);
    
    // Store session token in localStorage for persistence
    localStorage.setItem('admin_session_token', data.sessionToken);
  };

  const logout = async () => {
    // Call logout API to destroy database session
    if (sessionToken) {
      try {
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'X-Admin-Session': sessionToken,
            'x-device-fingerprint': deviceFingerprint,
          },
        });
      } catch (error) {
        console.error('Failed to destroy server session:', error);
      }
    }
    
    setSessionToken(null);
    localStorage.removeItem('admin_session_token');
    await signOut(auth);
  };

  const getAuthToken = async (): Promise<string | null> => {
    // Return session token if available (for admin operations)
    if (sessionToken) {
      return sessionToken;
    }
    
    // Fall back to Firebase token for initial auth
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  };

  // Check for existing session token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('admin_session_token');
    if (storedToken) {
      setSessionToken(storedToken);
    }
  }, []);

  // Generate device fingerprint after mount to avoid hydration issues
  useEffect(() => {
    // Only generate on client side
    if (typeof window !== 'undefined') {
      try {
        const fingerprint = generateDeviceFingerprint();
        setDeviceFingerprint(fingerprint);
        console.log('[AdminAuth] Device fingerprint generated:', fingerprint.substring(0, 10) + '...');
      } catch (error) {
        console.error('[AdminAuth] Failed to generate device fingerprint:', error);
        setDeviceFingerprint('error-generating-fingerprint');
      }
    }
  }, []);

  // Device fingerprinting function with graceful fallbacks
  const generateDeviceFingerprint = (): string => {
    try {
      // Only run on client side to avoid hydration issues
      if (typeof window === 'undefined') {
        return 'server-render-placeholder';
      }
    
    const components: string[] = [];
    
    // 1. User agent and language (always available)
    components.push(navigator.userAgent || 'unknown-ua');
    components.push(navigator.language || 'en');
    
    // 2. Screen properties with fallback
    try {
      components.push(`${screen.width || 0}x${screen.height || 0}`);
      components.push(`${screen.colorDepth || 0}`);
    } catch {
      components.push('0x0');
      components.push('0');
    }
    
    // 3. Timezone
    try {
      components.push(String(new Date().getTimezoneOffset()));
    } catch {
      components.push('0');
    }
    
    // 4. Canvas fingerprint with graceful fallback
    let canvasData = 'canvas-blocked';
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Test if canvas is actually writable
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.font = '11pt Arial';
        ctx.fillText('MZS Admin', 2, 15);
        
        // Try to get data URL
        try {
          canvasData = canvas.toDataURL().slice(-50);
        } catch (e) {
          // Canvas.toDataURL blocked by privacy settings
          canvasData = 'canvas-read-blocked';
        }
      }
    } catch (e) {
      // Canvas API completely blocked
      canvasData = 'canvas-api-blocked';
    }
    components.push(canvasData);
    
    // 5. Additional entropy from available APIs
    const entropy: string[] = [];
    
    // Hardware concurrency
    if (navigator.hardwareConcurrency) {
      entropy.push(`hw:${navigator.hardwareConcurrency}`);
    }
    
    // Device memory (if available)
    if ('deviceMemory' in navigator) {
      entropy.push(`mem:${(navigator as any).deviceMemory}`);
    }
    
    // Platform
    if (navigator.platform) {
      entropy.push(`plat:${navigator.platform}`);
    }
    
    // Combine all components
    const rawFingerprint = components.join('|') + '|' + entropy.join(',');
    
    // Create hash using available methods
    try {
      // Use subtle crypto if available
      if (window.crypto && window.crypto.subtle) {
        // For now, use simple base64 encoding
        // In production, you'd want to use crypto.subtle.digest
        return btoa(rawFingerprint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
      }
    } catch {
      // Fallback to simple encoding
    }
    
    // Final fallback: simple base64 encoding
    try {
      return btoa(rawFingerprint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    } catch {
      // Even btoa failed, use a simple hash
      let hash = 0;
      for (let i = 0; i < rawFingerprint.length; i++) {
        const char = rawFingerprint.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return 'fallback-' + Math.abs(hash).toString(36).padEnd(41, '0').slice(0, 41);
    }
    } catch (error) {
      console.error('Catastrophic fingerprint generation failure:', error);
      // Ultimate fallback - just use timestamp and random number
      return 'emergency-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15);
    }
  };

  const value = {
    user,
    isAdmin,
    loading,
    login,
    logout,
    getAuthToken,
    verifyMFA,
    sessionToken
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
} 