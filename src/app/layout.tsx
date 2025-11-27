'use client';
import { AppProviders } from '@/components/AppProviders';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Cross-Origin-Opener-Policy" content="same-origin" />
        <script src="https://www.google.com/recaptcha/api.js" async defer></script>
      </head>
      <body>
        <main style={{maxWidth: '600px', margin: '0 auto', background: 'var(--white)', borderRadius: '18px', boxShadow: 'var(--shadow)', padding: '2em 0'}}>
          <AppProviders>
            {children}
          </AppProviders>
        </main>
      </body>
    </html>
  );
} 