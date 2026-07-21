import './globals.css';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider, Toaster } from '@template/ui';

// DESIGN.md specifies Notion Sans (Inter-based); Inter is the distributable
// substitute (its first fallback). Exposes --font-sans, used by globals.css.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Template SaaS',
  description: 'Reference Next.js + Supabase application.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
