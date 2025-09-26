'use client';
import { WalletProvider } from '@/store/WalletContext';
import { Web3AuthProvider } from "@/lib/web3auth/Web3AuthProvider";
import './globals.css';
import Image from 'next/image';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Cross-Origin-Opener-Policy" content="same-origin" />
      </head>
      <body>
        <main style={{maxWidth: '600px', margin: '0 auto', background: 'var(--white)', borderRadius: '18px', boxShadow: 'var(--shadow)', padding: '2em 0'}}>
          <Web3AuthProvider>
          <WalletProvider>
            {children}
          </WalletProvider>
          </Web3AuthProvider>
        </main>
      </body>
    </html>
  );
} 