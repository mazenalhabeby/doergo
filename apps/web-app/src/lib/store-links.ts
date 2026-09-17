/**
 * Where the app actually lives, in one place.
 *
 * ⚠️ EXTRACTED FROM `StoreBadges.tsx` ON PURPOSE, and not merely for tidiness.
 * That file is a `'use client'` component that calls `useTranslation`, so
 * importing a URL constant from it pulls react-i18next and the badge markup
 * into whatever imports it — an import is a MODULE, not a symbol. That exact
 * mistake once put the entire five-language catalogue into the marketing
 * bundle (see `i18n-client-bundle.spec.ts`). Two strings with no dependencies
 * can be imported by anything.
 *
 * ⚠️ These are also configured server-side as `MOBILE_ANDROID_URL` /
 * `MOBILE_IOS_URL` and served from `GET /app/version` for the PHONE to read.
 * The duplication is deliberate: the phone is told where to go by the server so
 * a store move needs no app release, while the web pages need the links at
 * build time with no request. If one changes, change both.
 */

export const GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.hbcfield.app';

export const APP_STORE_URL = 'https://apps.apple.com/app/id6762745260';
