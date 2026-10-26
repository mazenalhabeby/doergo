import { Familjen_Grotesk, Inter, Martian_Mono } from "next/font/google"

/*
  The public site's faces — Inter for text, Familjen Grotesk for large light display, Martian Mono for micro-labels.
  Declared HERE, not in the root layout: next/font preloads a font for the routes that import it, so the app (in
  Geist) never downloads them. `SiteFont` puts their variables on the page; every marketing page renders inside it.
*/
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })
export const familjen = Familjen_Grotesk({
  subsets: ["latin"],
  variable: "--font-familjen",
  weight: ["400", "500", "600"],
  display: "swap",
})
export const martian = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-martian",
  weight: ["300", "400", "500"],
  display: "swap",
})

/** The three variables plus Inter as the text face — what `SiteFont` sets. */
export const SITE_FONT_CLASS = `${inter.variable} ${familjen.variable} ${martian.variable} font-site`
