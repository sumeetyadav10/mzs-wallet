'use client';

import { useEffect, useState } from 'react';
import { useWeb3Auth } from '@/lib/web3auth/Web3AuthProvider';
import { useWeb3Auth as useCapacitorWeb3Auth } from '@/components/Web3AuthCapacitorProvider';

export function useAuth() {
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Detect if running in Capacitor (mobile app)
    const capacitorAvailable = (window as any).Capacitor !== undefined;
    
    setIsMobile(capacitorAvailable);
    setIsLoading(false);
  }, []);

  const webAuth = useWeb3Auth();
  const mobileAuth = useCapacitorWeb3Auth();

  if (isLoading) {
    return {
      connect: async () => {},
      disconnect: () => {},
      getUserInfo: async () => null,
      getIdToken: async () => { throw new Error('Loading'); },
      getPrivateKey: () => null,
      getWallet: () => null,
      closeAuthPopup: () => {},
      isLoading: true,
      isConnected: false,
      web3auth: null,
      provider: null,
      isMobile: false,
      userInfo: null,
      error: null,
    };
  }

  if (isMobile) {
    // Mobile auth using Capacitor provider
    return {
      connect: mobileAuth.connect,
      disconnect: mobileAuth.disconnect,
      getUserInfo: mobileAuth.getUserInfo,
      getIdToken: mobileAuth.getIdToken,
      getPrivateKey: () => null, // Not directly available in standard interface
      getWallet: () => null, // Not directly available in standard interface
      closeAuthPopup: () => {
        // Mobile auth closeAuthPopup (no-op - Web3Auth handles this)
      },
      isLoading: mobileAuth.isLoading,
      isConnected: mobileAuth.isConnected,
      userInfo: null, // Not directly available in standard interface
      error: null, // Not directly available in standard interface
      web3auth: mobileAuth.web3auth,
      provider: mobileAuth.provider,
      isMobile: true,
    };
  }

  // Return web auth with mobile flag
  return {
    ...webAuth,
    closeAuthPopup: () => {
      // Web auth closeAuthPopup (no-op for web)
    },
    getPrivateKey: () => null, // Not directly available in standard interface
    getWallet: () => null, // Not directly available in standard interface
    userInfo: null, // Not directly available in standard interface
    error: null, // Not directly available in standard interface
    isMobile: false,
  };
}