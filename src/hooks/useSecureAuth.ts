import { useState, useCallback } from 'react';
import { useWeb3Auth } from '@/lib/web3auth/Web3AuthProvider';
import { FrontendSecurity } from '@/lib/security/frontend-security';
import { API_CONFIG } from '@/lib/api-config';
import { useCaptcha } from '@/components/security/CaptchaProvider';

interface SecureAuthResult {
  sessionToken: string;
  sessionData: any;
  secureEndpoints: any;
  userInfo: {
    uid: string;
    email: string;
    name: string;
  };
}

export const useSecureAuth = () => {
  const { connect, disconnect, getUserInfo, web3auth } = useWeb3Auth();
  const { executeRecaptcha } = useCaptcha();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const authenticateSecurely = useCallback(async (): Promise<SecureAuthResult | null> => {
    if (!web3auth) {
      throw new Error('Web3Auth not initialized');
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      // Step 1: Connect to Web3Auth if not already connected
      if (!web3auth.connected) {
        await connect();
      }

      // Step 2: Execute CAPTCHA verification
      const captchaToken = await executeRecaptcha('login');
      if (!captchaToken) {
        throw new Error('CAPTCHA verification failed');
      }

      // Step 3: Get Web3Auth ID token
      const idToken = await web3auth.authenticateUser();
      if (!idToken?.idToken) {
        throw new Error('Failed to get Web3Auth ID token');
      }

      // Step 4: Generate device fingerprint
      const deviceFingerprint = FrontendSecurity.generateDeviceFingerprint();

      // Step 5: Call secure OAuth endpoint with CAPTCHA
      const response = await fetch(API_CONFIG.AUTH.OAUTH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          web3AuthIdToken: idToken.idToken,
          deviceFingerprint,
          captchaToken
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Authentication failed');
      }

      const authResult = await response.json();
      
      if (!authResult.success) {
        throw new Error(authResult.error || 'Authentication failed');
      }

      // Step 6: Store session token securely
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('secure_session_token', authResult.data.sessionToken);
        sessionStorage.setItem('secure_endpoints', JSON.stringify(authResult.data.secureEndpoints));
        sessionStorage.setItem('user_info', JSON.stringify(authResult.data.userInfo));
      }

      return authResult.data;

    } catch (error) {
      console.error('Secure authentication error:', error);
      setAuthError(error instanceof Error ? error.message : 'Authentication failed');
      return null;
    } finally {
      setIsAuthenticating(false);
    }
  }, [web3auth, connect]);

  const logoutSecurely = useCallback(async () => {
    try {
      await disconnect();
      
      // Clear secure session data
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('secure_session_token');
        sessionStorage.removeItem('secure_endpoints');
        sessionStorage.removeItem('user_info');
      }
    } catch (error) {
      console.error('Secure logout error:', error);
    }
  }, [disconnect]);

  const getStoredUserInfo = useCallback(() => {
    if (typeof window === 'undefined') return null;
    
    const stored = sessionStorage.getItem('user_info');
    return stored ? JSON.parse(stored) : null;
  }, []);

  const getSessionToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    
    return sessionStorage.getItem('secure_session_token');
  }, []);

  const getSecureEndpoints = useCallback(() => {
    if (typeof window === 'undefined') return null;
    
    const stored = sessionStorage.getItem('secure_endpoints');
    return stored ? JSON.parse(stored) : null;
  }, []);

  return {
    authenticateSecurely,
    logoutSecurely,
    getStoredUserInfo,
    getSessionToken,
    getSecureEndpoints,
    isAuthenticating,
    authError
  };
};