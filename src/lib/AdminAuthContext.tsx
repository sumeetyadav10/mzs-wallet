'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { logger } from '@/lib/logger';

// Admin access is now determined by Firebase authentication
// Any user with a valid Firebase account can access admin panel

interface AdminAuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ 
    success: boolean; 
    requireMFA?: boolean; 
    challengeId?: string; 
    adminId?: string;
    error?: string;
  }>;
  verifyMFA: (challengeId: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  sessionToken: string | null;
  resendOTP: (challengeId: string) => Promise<void>;
  pendingMFARequest: {
    challengeId: string;
    adminId: string;
    email: string;
  } | null;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
};

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [pendingMFARequest, setPendingMFARequest] = useState<{
    challengeId: string;
    adminId: string;
    email: string;
  } | null>(null);
  // Device fingerprinting removed for admin panel - session-based security is sufficient

  // Any authenticated Firebase user is considered an admin
  const isAdmin = !!user?.email;

  // Generate device fingerprint for security
  const generateDeviceFingerprint = (): string => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint test', 2, 2);
      }
      
      const fingerprint = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform || 'unknown',
        screenResolution: `${screen.width}x${screen.height}x${screen.colorDepth}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        plugins: navigator.plugins.length,
        canvas: canvas.toDataURL().substring(0, 100)
      };
      
      // Create a hash from the fingerprint data
      const fpString = JSON.stringify(fingerprint);
      let hash = 0;
      for (let i = 0; i < fpString.length; i++) {
        const char = fpString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      return `fp_${Math.abs(hash).toString(16).padStart(8, '0')}`;
    } catch (error) {
      // Fallback if fingerprinting fails
      return `fp_fallback_${Date.now().toString(16)}`;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      // First authenticate with Firebase - this validates the user exists
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseToken = await userCredential.user.getIdToken();
      
      // Generate admin ID from email
      const adminId = email.split('@')[0];
      
      // Generate unique device fingerprint
      const currentFingerprint = generateDeviceFingerprint();
      console.log('[AdminAuth] Generated device fingerprint:', currentFingerprint);
      
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
    setPendingMFARequest({
      challengeId: data.challengeId,
      adminId,
      email
    });
    
    return { 
      success: true, 
      requireMFA: true, 
      challengeId: data.challengeId,
      adminId 
    };
    } catch (error: any) {
      logger.error('Admin login failed:', error);
      setPendingMFARequest(null);
      return { success: false, error: error.message };
    }
  };

  const resendOTP = async (challengeId: string) => {
    if (!pendingMFARequest) {
      throw new Error('No pending MFA request');
    }

    const response = await fetch('/api/admin/auth/resend-otp', {
      method: 'POST', 
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        challengeId,
        adminId: pendingMFARequest.adminId,
        email: pendingMFARequest.email
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to resend OTP');
    }
  };

  const verifyMFA = async (challengeId: string, code: string) => {
    // Generate the same device fingerprint used during login
    const currentFingerprint = generateDeviceFingerprint();
    console.log('[AdminAuth] Sending MFA verify with fingerprint:', currentFingerprint);
    
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
    localStorage.setItem('adminSessionToken', data.sessionToken);
    setPendingMFARequest(null);
  };

  const logout = useCallback(async () => {
    try {
      if (sessionToken) {
        const currentFingerprint = generateDeviceFingerprint();
        const response = await fetch('/api/admin/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-session': sessionToken,
            'x-device-fingerprint': currentFingerprint,
          }
        });
        
        if (!response.ok) {
          logger.error('Logout API call failed:', await response.text());
        }
      }
      
      localStorage.removeItem('adminSessionToken');
      setSessionToken(null);
      setPendingMFARequest(null);
      
      if (auth.currentUser) {
        await auth.signOut();
      }
    } catch (error) {
      logger.error('Logout error:', error);
      // Still clear local state even if API call fails
      localStorage.removeItem('adminSessionToken');
      setSessionToken(null);
      setPendingMFARequest(null);
    }
  }, [sessionToken]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('adminSessionToken');
    if (storedToken) {
      setSessionToken(storedToken);
    }
  }, []);

  // Device fingerprinting removed - no longer needed for admin panel

  // Device fingerprinting removed - admin sessions are secured through other means

  const value = {
    user,
    isAdmin,
    loading,
    login,
    verifyMFA,
    logout,
    sessionToken,
    resendOTP,
    pendingMFARequest
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};