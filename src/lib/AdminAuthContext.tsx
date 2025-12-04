'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { logger } from '@/lib/logger';

// Define admin emails who can access the admin panel
const ADMIN_EMAILS = ['suda159@gmail.com', 'yadsum396@gmail.com'];

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

  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;

  const login = async (email: string, password: string) => {
    try {
      if (!ADMIN_EMAILS.includes(email)) {
        throw new Error('Unauthorized email address');
      }
      
      // Generate admin ID from email
      const adminId = email.split('@')[0];
      
      // First authenticate with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseToken = await userCredential.user.getIdToken();
      
      // Use static fingerprint - device fingerprinting disabled for admin panel
      const currentFingerprint = 'admin-session-static';
      console.log('[AdminAuth] Sending MFA challenge');
      
      // Initiate MFA challenge
      const response = await fetch('/api/admin/auth/mfa-challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firebaseToken}`,
        'x-device-fingerprint': 'admin-session-static',
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
    // Use static fingerprint - device fingerprinting disabled for admin panel
    console.log('[AdminAuth] Sending MFA verify');
    
    const response = await fetch('/api/admin/auth/mfa-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-fingerprint': 'admin-session-static',
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
        const response = await fetch('/api/admin/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-session': sessionToken,
            'x-device-fingerprint': 'admin-session-static',
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