import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/**
 * The rules of hooks, enforced.
 *
 * ⚠️ THERE WAS NO ESLINT CONFIG IN THIS APP AT ALL. `pnpm lint` exited on
 * "couldn't find eslint.config.js" and had presumably done so for a long time,
 * which is why the one rule that would have caught a red screen on a member's
 * phone had never run once.
 *
 * What it missed: `update-banner.tsx` called `useState` and `useEffect` BELOW
 * an early `return null`. React counts hooks per render, so the first render
 * that got past the guard called two more than the one before it — "Rendered
 * more hooks than during the previous render", a crash with no way back except
 * force-quitting the app. It sat there harmlessly for as long as the banner
 * never appeared, and detonated the day the banner was fixed to appear.
 *
 * Deliberately narrow. A full lint config for an app this size is a day of
 * arguing about quote style; these two rules are the ones whose violations are
 * a crash rather than an opinion, and a config that lands today catches the
 * next one. Widen it later.
 */
export default [
  {
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    languageOptions: {
      // Parse only — no type information needed, and asking for it would make
      // a lint run as slow as a build.
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    /*
      The TypeScript plugin is REGISTERED, and none of its rules are switched
      on. Existing files carry `eslint-disable` comments naming its rules, and
      an unknown rule name in a disable comment is itself an error — so without
      this, four files fail on comments that are asking for less linting.
    */
    plugins: { 'react-hooks': reactHooks, '@typescript-eslint': tsPlugin },
    rules: {
      // A crash, not a style.
      'react-hooks/rules-of-hooks': 'error',
      // A stale closure — a real defect, but one that produces wrong data
      // rather than a red screen, and there is existing code to clean up.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
