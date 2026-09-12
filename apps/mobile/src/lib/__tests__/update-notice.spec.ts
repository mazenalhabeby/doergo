import fs from 'fs';
import path from 'path';

/*
  ⚠️ THE 1.0.5 RELEASE WENT UNANNOUNCED, and none of the three reasons were a
  missing feature — the banner had shipped, was mounted, and the server answered
  correctly. It was asked at the wrong moment, silenced by one tap, and had no
  second channel. These are the three rules that make it reach people.
*/

const MOBILE = path.join(__dirname, '../..', '..');
const read = (p: string) => fs.readFileSync(path.join(MOBILE, p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const CONTEXT = 'src/contexts/version-context.tsx';
const BANNER = 'src/components/update-banner.tsx';
const PROFILE = 'app/(app)/(tabs)/profile.tsx';

describe('a new version is noticed more than once per launch', () => {
  /*
    `MOBILE_LATEST_VERSION` is raised the moment the store publishes. Every app
    already open asked BEFORE that, was told nothing was new, and — with a
    once-on-mount `useEffect` — never asked again. A work phone keeps this app
    open for days, so that is not a small window.
  */
  it('re-checks when the app comes back to the foreground', () => {
    const src = stripComments(read(CONTEXT));
    expect(src).toContain('AppState.addEventListener');
    expect(src).toMatch(/state === 'active'[\s\S]{0,120}run\(\)/);
  });

  it('is throttled, because foregrounding happens far more often than a release', () => {
    const src = stripComments(read(CONTEXT));
    expect(src).toMatch(/RECHECK_AFTER_MS[\s\S]{0,60}=/);
    expect(src).toMatch(/lastCheck/);
  });

  it('only one thing in the app asks the question', () => {
    // Two callers are two requests and two chances to disagree about the answer.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(path.join(MOBILE, dir), { withFileTypes: true })) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
          walk(rel, out);
        } else if (/\.tsx?$/.test(e.name) && !rel.includes('__tests__')) out.push(rel);
      }
      return out;
    };
    /*
      One NAMED exception: the error boundary.

      It is a class component, so no hook reaches it, and it sits ABOVE the
      provider in the tree — when it catches, the provider may be part of the
      subtree that just came down. It reads `lastKnownVersion()` first and only
      asks when nothing is known at all, which is the case where there is no
      shared answer to reuse.
    */
    const EXEMPT = new Set(['src/components/error-boundary.tsx']);
    const callers = [...walk('app'), ...walk('src')]
      .filter((f) => f !== CONTEXT && f !== 'src/lib/version-gate.ts' && !EXEMPT.has(f))
      .filter((f) => /\bcheckVersion\(/.test(stripComments(read(f))));
    expect(callers).toEqual([]);
  });
});

describe('dismissing the banner is a snooze, not a mute', () => {
  /*
    The ✕ used to write the version string and compare for equality, so one tap
    — including a mis-tap on a banner that overlays the top of the screen —
    silenced that release permanently.
  */
  it('what is stored carries a time, and is read back with an expiry', () => {
    const src = stripComments(read(BANNER));
    expect(src).toMatch(/SNOOZE_MS[\s\S]{0,80}=/);
    expect(src).toMatch(/setItem\([\s\S]{0,60}Date\.now\(\)/);
    expect(src).toMatch(/Date\.now\(\) - Number\([\s\S]{0,20}\) < SNOOZE_MS/);
  });

  it('a storage failure shows the banner rather than hiding it', () => {
    // Twice is a smaller cost than never.
    expect(stripComments(read(BANNER))).toMatch(/catch\([\s\S]{0,120}setDismissed\(false\)/);
  });
});

describe('the banner is not the only channel', () => {
  /*
    Whoever closes it, or simply never had the app open in the minutes it was
    shown, must still be able to find out. This entry cannot be dismissed.
  */
  it('Profile carries an entry that appears whenever an update is available', () => {
    const src = stripComments(read(PROFILE));
    expect(src).toMatch(/versionStatus\?\.updateAvailable/);
    expect(src).toContain('profile.menu.updateAvailable');
    expect(src).toContain('openUpdate(');
  });

  it('both surfaces open the update the same way', () => {
    // Android can update in place; a hand-rolled second copy reaches for
    // Linking and silently opens a web page on a phone that need not leave.
    for (const f of [BANNER, PROFILE]) {
      const src = stripComments(read(f));
      expect(src).toContain('openUpdate');
      expect(src).not.toContain('startStoreUpdate');
    }
  });

  it('is translated into all five languages', () => {
    for (const lang of ['en', 'de', 'es', 'fr', 'it']) {
      const dict = JSON.parse(read(`src/i18n/locales/${lang}.json`));
      expect({ lang, label: dict.profile?.menu?.updateAvailable }).toEqual({
        lang,
        label: expect.stringContaining('{{version}}'),
      });
    }
  });
});

describe('a crash on an outdated app says so, instead of quoting React', () => {
  /*
    ⚠️ Reported with a screenshot: a member on an old build was shown "Rendered
    more hooks than during the previous render" — English text under a German
    heading, above a button that retried the same broken render. That sentence
    is React's internal vocabulary. It tells a driver nothing and cannot be
    acted on.

    And the cause was the build's AGE. An over-the-air update is pinned to the
    native binary it was made for, so a phone that has not been updated in the
    store keeps running months-old JavaScript, bugs included. A crash there is
    not news; it is a version.
  */
  const BOUNDARY = 'src/components/error-boundary.tsx';

  it('asks whether a newer version exists once something has broken', () => {
    const src = stripComments(read(BOUNDARY));
    expect(src).toContain('lastKnownVersion()');
    expect(src).toMatch(/componentDidCatch[\s\S]{0,900}updateAvailable/);
  });

  it('prefers the answer the app already has to a fresh request', () => {
    // A spinner on a screen that has already failed once is the second thing
    // to go wrong in a row.
    const src = stripComments(read(BOUNDARY));
    expect(src.indexOf('lastKnownVersion()')).toBeLessThan(src.indexOf('checkVersion()'));
  });

  it('offers the update, and still lets them back in', () => {
    const src = stripComments(read(BOUNDARY));
    expect(src).toContain('openUpdate(');
    expect(src).toContain('errors.updateNow');
    // The update is a trip to the store; somebody in a van may need the screen
    // back first, and refusing them that is not our call.
    expect(src).toContain('errors.tryAgain');
  });

  it('never makes the exception the headline', () => {
    const src = stripComments(read(BOUNDARY));
    // Kept for support, demoted to a muted line — not the title, not the body.
    expect(src).not.toMatch(/s\.title[\s\S]{0,120}error\?\.message/);
    expect(src).not.toMatch(/s\.message[\s\S]{0,120}error\?\.message/);
    expect(src).toMatch(/s\.detail[\s\S]{0,120}error\.message/);
  });

  it('is translated into all five languages', () => {
    for (const lang of ['en', 'de', 'es', 'fr', 'it']) {
      const dict = JSON.parse(read(`src/i18n/locales/${lang}.json`));
      const missing = ['outdatedTitle', 'outdatedBody', 'updateNow', 'tryAgain']
        .filter((k) => typeof dict.errors?.[k] !== 'string');
      expect({ lang, missing }).toEqual({ lang, missing: [] });
    }
  });
});
