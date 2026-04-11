'use client';

import { useWeb3Auth } from '@/lib/web3auth/Web3AuthProvider';

export function useAuth() {
  const webAuth = useWeb3Auth();

  return {
    ...webAuth,
    closeAuthPopup: () => {},
    getPrivateKey: () => null,
    getWallet: () => null,
    userInfo: null,
    error: null,
    isMobile: false,
  };
}
