import type { Config } from "tailwindcss"
import hbcfieldPreset from "@hbcfield/shared/design/tailwind-preset"

const config: Config = {
  presets: [hbcfieldPreset],
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Include shared package for component styles
    "../../packages/shared/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        shell: {
          ground: "var(--shell-ground-base)",
          card: "var(--shell-card)",
          ink: "var(--shell-ink)",
          soft: "var(--shell-soft)",
          line: "var(--shell-line)",
          hover: "var(--shell-hover)",
          "nav-on": "var(--shell-nav-on)",
          "nav-on-ink": "var(--shell-nav-on-ink)",
          accent: "var(--shell-accent)",
          "on-accent": "var(--shell-on-accent)",
          "accent-soft": "var(--shell-accent-soft)",
          live: "var(--shell-live)",
          warn: "var(--shell-warn)",
          "on-warn": "var(--shell-on-warn)",
          crit: "var(--shell-crit)",
          chip: "var(--shell-chip)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      transitionTimingFunction: {
        // Named easings (avoids ambiguous arbitrary `ease-[cubic-bezier(...)]`
        // classes, whose inner commas Tailwind can't disambiguate).
        apple: "cubic-bezier(0.32, 0.72, 0, 1)",
        overshoot: "cubic-bezier(0.68, -0.15, 0.32, 1.15)",
      },
      /* The shell's two shadows, from CSS (light + dark). Named so cn() knows they ARE shadows — see lib/utils. */
      // The app shell's face (layout.tsx loads Geist through next/font) — the redesign boards draw the shell in it.
      fontFamily: {
        shell: ["var(--font-geist)", "system-ui", "-apple-system", "sans-serif"],
        "shell-mono": ["var(--font-geist-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        shell: "var(--shell-shadow)",
        "shell-pop": "var(--shell-pop-shadow)",
      },
      keyframes: {
        shimmer: {
          "100%": {
            transform: "translateX(100%)",
          },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
