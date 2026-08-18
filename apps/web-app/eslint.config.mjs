import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

/**
 * Flat config (ESLint 9). Without this file `next lint` cannot run at all, so
 * the repo's hook-dependency and a11y rules were never enforced in the web app.
 *
 * Starts from Next's own preset. Rules are intentionally not loosened here —
 * anything currently failing is a finding to fix, not a rule to switch off.
 */
export default [
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "public/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
]
