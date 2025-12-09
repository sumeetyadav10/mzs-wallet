'use client';
import { AppProviders } from '@/components/AppProviders';
import ChunkErrorBoundary from '@/components/ChunkErrorBoundary';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import './globals.css';
import './web3auth-modal-fixes.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');
  
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Cross-Origin-Opener-Policy" content="same-origin" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
      <body>
        {/* Only load reCAPTCHA for non-admin routes */}
        {!isAdminRoute && (
          <Script 
            src="https://www.google.com/recaptcha/api.js" 
            strategy="lazyOnload"
          />
        )}
        <Script
          id="chunk-retry"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              // Initialize chunk retry before webpack loads
              window.__CHUNK_RETRY_DELAY__ = 1000;
              window.__CHUNK_MAX_RETRIES__ = 3;
            `
          }}
        />
        <main style={{maxWidth: '600px', margin: '0 auto', background: 'var(--white)', borderRadius: '18px', boxShadow: 'var(--shadow)', padding: '2em 0'}}>
          <ChunkErrorBoundary>
            <AppProviders>
              {children}
            </AppProviders>
          </ChunkErrorBoundary>
        </main>
      </body>
    </html>
  );
} 