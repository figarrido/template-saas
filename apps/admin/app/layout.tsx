import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@template/ui';

export const metadata: Metadata = {
  title: 'Template Admin',
  description: 'Internal admin surface.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
