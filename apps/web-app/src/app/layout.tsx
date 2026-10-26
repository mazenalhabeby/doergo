import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/auth-context"
import { QueryProvider } from "@/providers/query-provider"
import { I18nProvider } from "@/providers/i18n-provider"
import { ThemeProvider } from "@/components/app-shell/theme-provider"
import { Toaster } from "@/components/ui"

// display:'swap' → text paints immediately in the fallback and swaps when the
// web font loads (better LCP, no invisible-text FOIT). size-adjust fallbacks are
// applied by next/font automatically to keep the swap CLS-free.
// The app's face — the web redesign's Geist (the body's font; the public site switches back to Inter).
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" })
// Figures in the shell (the running clock): tabular, so a ticking time never shifts sideways. Not preloaded —
// only somebody on the clock sees it.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: ["500", "600"],
  display: "swap",
  preload: false,
})
// The public site's three faces (Inter, Familjen Grotesk, Martian Mono) live in components/marketing/site-fonts:
// loaded — and preloaded — only on the pages that render them, never on an app page.

const SITE_URL = "https://hbcfield.com"
const SITE_DESCRIPTION =
  "HBCField unifies task dispatch, GPS tracking, employee time & " +
  "attendance, service reports and invoicing for field teams — in real time " +
  "on web and mobile."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "HBCField — Field Service Management, Time & Attendance Software",
    template: "%s | HBCField",
  },
  description: SITE_DESCRIPTION,
  applicationName: "HBCField",
  keywords: [
    "field service management",
    "FSM software",
    "technician dispatch software",
    "time and attendance software",
    "GPS technician tracking",
    "work order management",
    "job scheduling software",
    "service report app",
    "field team management",
  ],
  authors: [{ name: "HBCField" }],
  creator: "HBCField",
  publisher: "HBCField",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "HBCField",
    title: "HBCField — Field Service Management, Time & Attendance Software",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en",
    // opengraph-image.tsx supplies the image automatically.
  },
  twitter: {
    card: "summary_large_image",
    title: "HBCField — Field Service Management",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: "/favicon.png",
  },
  category: "business software",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      {/*
        Browser extensions write into <body> before React hydrates — Grammarly
        adds `data-gr-ext-installed` and `data-new-gr-c-s-check-loaded`, and
        password managers do the same — so the server HTML and the client tree
        disagree about attributes this app never set.

        `suppressHydrationWarning` on <html> does NOT cover this: it applies to
        that element and its attributes only, one level deep, so <body> needs
        its own. It silences the ATTRIBUTE diff on this element alone and does
        not hide mismatches in anything rendered inside it.
      */}
      <body
        suppressHydrationWarning
        className={[geist, geistMono]
          .map((f) => f.variable)
          .concat(geist.className)
          .join(" ")}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          forcedTheme={undefined}
          storageKey="hbcfield-theme"
        >
          <I18nProvider>
            <QueryProvider>
              <AuthProvider>{children}</AuthProvider>
            </QueryProvider>
          </I18nProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
