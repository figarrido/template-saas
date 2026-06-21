import './globals.css';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { ThemeProvider, Toaster } from '@template/ui';

export const metadata: Metadata = {
  title: 'Template SaaS',
  description: 'Reference Next.js + Supabase application.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-csp-nonce') ?? undefined;
  return (
    // GeistSans.variable exposes --font-geist-sans, used by globals.css
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
