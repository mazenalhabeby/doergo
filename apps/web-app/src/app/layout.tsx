import type { Metadata } from 'next';
import { Inter, Outfit, Familjen_Grotesk, Martian_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { QueryProvider } from '@/providers/query-provider';
import { I18nProvider } from '@/providers/i18n-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui';

// display:'swap' → text paints immediately in the fallback and swaps when the
// web font loads (better LCP, no invisible-text FOIT). size-adjust fallbacks are
// applied by next/font automatically to keep the swap CLS-free.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '800'], display: 'swap' });
// Marketing/landing typography — mirrors the studio-grade reference:
// Familjen Grotesk for large light-weight display, Martian Mono for micro-labels.
const familjen = Familjen_Grotesk({ subsets: ['latin'], variable: '--font-familjen', weight: ['400', '500', '600'], display: 'swap' });
const martian = Martian_Mono({ subsets: ['latin'], variable: '--font-martian', weight: ['300', '400', '500'], display: 'swap' });

const SITE_URL = 'https://hbcfield.com';
const SITE_DESCRIPTION =
  'HBCField unifies task dispatch, GPS tracking, employee time & attendance, service reports and invoicing for field teams — in real time on web and mobile.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'HBCField — Field Service Management, Time & Attendance Software',
    template: '%s | HBCField',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'HBCField',
  keywords: [
    'field service management',
    'FSM software',
    'technician dispatch software',
    'time and attendance software',
    'GPS technician tracking',
    'work order management',
    'job scheduling software',
    'service report app',
    'field team management',
  ],
  authors: [{ name: 'HBCField' }],
  creator: 'HBCField',
  publisher: 'HBCField',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'HBCField',
    title: 'HBCField — Field Service Management, Time & Attendance Software',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en',
    // opengraph-image.tsx supplies the image automatically.
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HBCField — Field Service Management',
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: '/favicon.png',
  },
  category: 'business software',
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
