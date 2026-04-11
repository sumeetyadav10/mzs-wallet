'use client';

import { Web3AuthProvider } from '@/lib/web3auth/Web3AuthProvider';
import { WalletProvider } from '@/store/WalletContext';
import { CaptchaProvider } from '@/components/security/CaptchaProvider';
import { usePathname } from 'next/navigation';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // For admin routes, don't wrap with Web3Auth or Captcha providers
  const isAdminRoute = pathname?.startsWith('/admin');

  if (isAdminRoute) {
    return <>{children}</>;
  }

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
