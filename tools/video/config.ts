/**
 * One place for every knob the pipeline turns, and the safety rail that keeps
 * it away from production.
 *
 * WHY a single module: the seed, the capture and the assembly each need the
 * same viewport, the same demo credentials and the same output directory. When
 * those lived in three files they drifted, and a capture run silently recorded
 * at a different size than the title card was rendered at.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEPOT, LEAD, DEMO_PASSWORD } from './demo-data.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = here;
export const OUT_DIR = path.join(here, 'renders');
export const REPO_ROOT = path.resolve(here, '..', '..');

/**
 * Borrow the auth service's own .env for DATABASE_URL.
 *
 * WHY rather than asking the operator to export it: the seed has to talk to
 * the same database the running dev stack talks to. Any second copy of that
 * connection string is a chance to seed one database and record against
 * another, which produces an empty-looking video and a long hunt for why.
 * An explicitly-set DATABASE_URL still wins, so CI or a second database is
 * one variable away.
 */
if (!process.env.DATABASE_URL) {
  const authEnv = path.join(REPO_ROOT, 'apps', 'api', 'auth-service', '.env');
  try {
    process.loadEnvFile(authEnv);
  } catch {
    // Absent is fine — assertLocalDatabase produces the useful message.
  }
}

/**
 * 1440x900 rather than 1920x1080.
 *
 * WHY: YouTube delivers 1080p, but the app's own text is sized for a laptop.
 * Recording at 1920 wide and letting YouTube downscale makes every label in
 * the product about 12 CSS px on a phone — unreadable, which is where most
 * product videos are actually watched. Capturing at 1440x900 and upscaling to
 * 1920x1080 at assembly time trades a little sharpness for text that is
 * legible at every size. The aspect ratios differ (16:10 vs 16:9), so
 * assembly pads rather than stretches — see assemble/ffmpeg.ts.
 */
export const VIEWPORT = { width: 1440, height: 900 } as const;

/** What YouTube finally receives. */
export const OUTPUT = { width: 1920, height: 1080, fps: 30 } as const;

/**
 * The browser is told it is standing on the depot's own pin.
 *
 * ⚠️ Read from demo-data.ts rather than typed again here. The clock-in is
 * re-checked against the geofence on the server, so if these two numbers ever
 * drift apart the video ends on "you are too far from this workspace" — a
 * failure that looks like a product bug rather than a config mistake. One
 * source, no drift.
 */
export const RECORDING_POSITION = { latitude: DEPOT.lat, longitude: DEPOT.lng } as const;

/** Where the running dev stack lives. Overridable for a non-default port. */
export const WEB_URL = process.env.VIDEO_WEB_URL ?? 'http://localhost:3000';

/**
 * The account every flow signs in as. Created by seed-video.ts and by nothing
 * else — it exists only inside the fictional recording organisation.
 */
export const DEMO_LOGIN = { email: LEAD.email, password: DEMO_PASSWORD } as const;

/** Locales we ship subtitles for. English is the narrated one. */
export const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Refuse to touch anything that is not a database on this machine.
 *
 * WHY this is a hard stop rather than a warning: the seed writes an
 * organisation, members and a month of attendance. Pointed at production it
 * would create a fake company inside a real customer's billing and seat count.
 * A warning gets ignored the one time it matters, so this throws.
 */
export function assertLocalDatabase(url: string | undefined): string {
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Point it at your local dev database, e.g.\n' +
        '  postgresql://hbcfield:hbcfield_secret@localhost:5432/hbcfield',
    );
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a URL this tool can check: ${url}`);
  }

  // Docker-compose service names count as local: the dev stack reaches Postgres
  // as "postgres"/"db" from inside the network, and that is still a laptop.
  const LOCAL_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    'postgres',
    'db',
    'host.docker.internal',
  ]);

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${host}", which is not a local database.\n` +
        'The video pipeline seeds a fictional organisation and must never run against production.',
    );
  }

  // A second, independent check. Production is reached through PgBouncer, and a
  // tunnelled connection can arrive on localhost, so the hostname alone is not
  // proof. These markers only ever appear on the real thing.
  const PROD_MARKERS = ['pgbouncer', 'hbcfield.com', 'prod'];
  const lowered = url.toLowerCase();
  for (const marker of PROD_MARKERS) {
    if (lowered.includes(marker)) {
      throw new Error(
        `Refusing to run: DATABASE_URL contains "${marker}", which looks like production.`,
      );
    }
  }

  return url;
}

/** The same rail for the web app the browser is pointed at. */
export function assertLocalWeb(url: string): string {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(
      `Refusing to record "${url}". Videos are captured against the local dev server only —\n` +
        'recording production would put real customer data on YouTube.',
    );
  }
  return url;
}
