import type { Metadata } from 'next';
import UpdateClient from './update-client';

/**
 * `/update` — the page you send somebody whose app is out of date.
 *
 * Public and unauthenticated on purpose: it is opened from an SMS, by a member
 * who cannot get past the update wall to sign in, and sometimes on a borrowed
 * phone. Asking for a login here would defeat the only channel that still works.
 *
 * ⚠️ NOT under `/downloads/` — nginx answers `410 Gone` for everything there
 * except an `.apk`, which it 301s to Play (`infra/docker/nginx/default.conf`).
 * A page filed there would be unreachable.
 *
 * ⚠️ `noindex`. This is an operational link with a shelf life, not a marketing
 * page; a search result telling a stranger their app is out of date is noise,
 * and the version below will be stale eventually.
 */

export const metadata: Metadata = {
  title: 'Update HBCField',
  description: 'Get the latest version of the HBCField app for your phone.',
  robots: { index: false, follow: false },
};

/**
 * The version the stores are serving.
 *
 * ⚠️ Read from the SAME environment variable the gateway serves to the phone
 * (`MOBILE_LATEST_VERSION`), so the number on this page and the number the app
 * checks itself against cannot disagree. The fallback is the floor rather than
 * a guess: if the variable is missing, the page still works and merely shows a
 * conservative number — where a hard-coded current version would quietly go
 * stale on the next release and tell people to update to what they already have.
 *
 * ⚠️ It is read on the SERVER. `NEXT_PUBLIC_*` would inline it at build time,
 * which is exactly how a value gets frozen into an image and stops matching
 * production (see the MapTiler build-arg incident in CLAUDE.md).
 */
const LATEST = process.env.MOBILE_LATEST_VERSION || '1.0.6';

export default function UpdatePage() {
  return <UpdateClient latest={LATEST} />;
}
