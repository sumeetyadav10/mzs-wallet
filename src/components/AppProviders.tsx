'use client';

import { Web3AuthProvider } from '@/lib/web3auth/Web3AuthProvider';
import { WalletProvider } from '@/store/WalletContext';
import { Web3AuthCapacitorProvider } from '@/components/Web3AuthCapacitorProvider';
import { CaptchaProvider } from '@/components/security/CaptchaProvider';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    // Detect if running in Capacitor (mobile app)
    setIsMobile((window as any).Capacitor !== undefined);
    setIsLoading(false);
  }, []);

  // Check if current route is admin panel
  const isAdminRoute = pathname?.startsWith('/admin');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#181A20]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]"></div>
      </div>
    );
  }

  // For admin routes, don't wrap with Web3Auth providers
  if (isAdminRoute) {
    return (
      <CaptchaProvider>
        {children}
      </CaptchaProvider>
    );
  }

  if (isMobile) {
    // Mobile app providers - Using Web3Auth Capacitor Provider
    return (
      <CaptchaProvider>
        <Web3AuthCapacitorProvider>
          <WalletProvider>
            {children}
          </WalletProvider>
        </Web3AuthCapacitorProvider>
      </CaptchaProvider>
    );
  }

  // Web app providers
  return (
    <CaptchaProvider>
      <Web3AuthProvider>
        <WalletProvider>
          {children}
        </WalletProvider>
      </Web3AuthProvider>
    </CaptchaProvider>
  );
}