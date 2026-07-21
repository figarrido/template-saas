import './globals.css';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider, Toaster } from '@template/ui';

// Matches apps/web: Inter as the DESIGN.md substitute for Notion Sans.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Template Admin',
  description: 'Internal admin surface.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Pass the per-request CSP nonce to next-themes so its inline anti-FOUC
  // script carries a nonce. Admin's script-src is strict (nonce + strict-dynamic,
  // no 'unsafe-inline'); an unnonced inline script is blocked, which under
  // strict-dynamic also blocks the rest of the bundle — the page never hydrates
  // and Server Action forms fall back to a native POST. Mirrors apps/web.
  const nonce = (await headers()).get('x-csp-nonce') ?? undefined;
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
