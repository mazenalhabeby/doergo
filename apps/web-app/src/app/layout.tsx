import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { QueryProvider } from '@/providers/query-provider';
import { I18nProvider } from '@/providers/i18n-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '800'] });

export const metadata: Metadata = {
  title: 'HBCField',
  description: 'Dispatch · Track · Deliver',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${outfit.variable} ${inter.className}`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme={undefined} storageKey="hbcfield-theme">
          <I18nProvider>
            <QueryProvider>
              <AuthProvider>{children}</AuthProvider>
            </QueryProvider>
          </I18nProvider>
          <Toaster position="bottom-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
