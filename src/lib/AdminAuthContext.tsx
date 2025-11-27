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
      
      // Initiate MFA challenge
      const response = await fetch('/api/admin/auth/mfa-challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firebaseToken}`,
        'x-device-fingerprint': generateDeviceFingerprint(),
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
    const response = await fetch('/api/admin/auth/mfa-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-fingerprint': generateDeviceFingerprint(),
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

  // Device fingerprinting function
  const generateDeviceFingerprint = (): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx?.fillText('MZS Admin', 2, 2);
    const canvasFingerprint = canvas.toDataURL();
    
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      canvasFingerprint.slice(0, 50)
    ].join('|');
    
    return btoa(fingerprint).slice(0, 50);
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