import type { Metadata } from 'next';
import { Inter, Outfit, Familjen_Grotesk, Martian_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { QueryProvider } from '@/providers/query-provider';
import { I18nProvider } from '@/providers/i18n-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '800'] });
// Marketing/landing typography — mirrors the studio-grade reference:
// Familjen Grotesk for large light-weight display, Martian Mono for micro-labels.
const familjen = Familjen_Grotesk({ subsets: ['latin'], variable: '--font-familjen', weight: ['400', '500', '600'] });
const martian = Martian_Mono({ subsets: ['latin'], variable: '--font-martian', weight: ['300', '400', '500'] });

export const metadata: Metadata = {
  title: 'HBCField',
  description: 'Dispatch · Track · Deliver',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${outfit.variable} ${familjen.variable} ${martian.variable} ${inter.className}`}>
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
