import './globals.css';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { ThemeProvider, Toaster } from '@template/ui';

export const metadata: Metadata = {
  title: 'Template SaaS',
  description: 'Reference Next.js + Supabase application.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-csp-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
