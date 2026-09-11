import fs from 'fs';
import path from 'path';
import { PURPOSES, PROMISE, purposeOf, type MediaPurpose } from '../../permissions/purposes';

const MOBILE = path.join(__dirname, '../../..');
const files = (dir: string, out: string[] = []): string[] => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      files(full, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};
/** Code only — the warnings in these files name the symbols in prose. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ALL = [...files(path.join(MOBILE, 'app')), ...files(path.join(MOBILE, 'src'))]
  .filter((f) => !f.includes('__tests__'));
const PERMISSIONS_DIR = path.join(MOBILE, 'src/permissions');
const rel = (f: string) => path.relative(MOBILE, f);

describe('the permission screen never makes a claim that is false', () => {
  /*
    ⚠️ THE TEST THIS WHOLE REGISTRY EXISTS FOR.

    These lines are shown at the exact moment somebody decides whether to trust
    the app with a camera. The business-card wording was hard-coded into the
    shared screen, so the receipt flow — which UPLOADS the slip — told people
    "the card is never uploaded". `uploads` makes that contradiction a failing
    test rather than something a reviewer has to notice.
  */
  const ON_DEVICE_ONLY = [PROMISE.readHere.k, PROMISE.deletedAfterReading.k];

  it.each(Object.keys(PURPOSES) as MediaPurpose[])(
    '%s: if it uploads, it does not promise the image stays here',
    (name) => {
      const p = purposeOf(name);
      if (!p.uploads) return;
      const claimed = p.promises.map((x) => x.k);
      for (const lie of ON_DEVICE_ONLY) expect(claimed).not.toContain(lie);
    },
  );

  it('every purpose says something specific — a generic screen teaches people to skip it', () => {
    for (const name of Object.keys(PURPOSES) as MediaPurpose[]) {
      const p = purposeOf(name);
      expect(p.promises.length).toBeGreaterThanOrEqual(2);
      expect(p.title.d.length).toBeGreaterThan(6);
      // Never a dead end: every flow has a by-hand alternative.
      expect(p.cancel.d.length).toBeGreaterThan(2);
    }
  });

  it('promises are reused atoms, so one guarantee reads the same everywhere', () => {
    const atoms = new Set(Object.values(PROMISE).map((p) => p.k));
    for (const name of Object.keys(PURPOSES) as MediaPurpose[]) {
      for (const promise of purposeOf(name).promises) expect(atoms).toContain(promise.k);
    }
  });

  it('is translated into all five languages', () => {
    const wanted = new Set<string>();
    for (const name of Object.keys(PURPOSES) as MediaPurpose[]) {
      const p = purposeOf(name);
      [p.title.k, p.subtitle.k, ...p.promises.map((x) => x.k)].forEach((k) => wanted.add(k));
    }
    for (const lang of ['en', 'de', 'es', 'fr', 'it']) {
      const dict = JSON.parse(
        fs.readFileSync(path.join(MOBILE, `src/i18n/locales/${lang}.json`), 'utf8'),
      );
      const missing = [...wanted].filter(
        (k) => k.split('.').reduce<any>((o, seg) => (o == null ? o : o[seg]), dict) === undefined,
      );
      expect({ lang, missing }).toEqual({ lang, missing: [] });
    }
  });
});

describe('permission state is read continuously, and never guessed', () => {
  /*
    Every `use*Permissions()` hook in expo reads ONCE, on mount, and never
    again — so a permission revoked in Settings leaves `granted: true` behind
    and the screen renders a viewfinder for a camera the OS will refuse.
    `use-media-access` re-reads on focus; nothing else may bind the raw hooks.
  */
  it('only the permissions module touches the raw expo hooks', () => {
    const offenders = ALL
      .filter((f) => !f.startsWith(PERMISSIONS_DIR))
      .filter((f) => {
        const code = stripComments(fs.readFileSync(f, 'utf8'));
        return /useCameraPermissions|useMediaLibraryPermissions|request(Camera|MediaLibrary)PermissionsAsync/.test(code);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  /*
    ⚠️ Returning from the Settings app is NOT a navigation focus event — the
    screen never blurred. The only button on a blocked screen sends people
    there, so without this the answer never refreshes and "Open settings" just
    opens Settings again, forever.
  */
  it('re-reads when the app itself comes back, not only on navigation', () => {
    const src = stripComments(fs.readFileSync(path.join(PERMISSIONS_DIR, 'use-media-access.ts'), 'utf8'));
    expect(src).toContain('AppState.addEventListener');
    expect(src).toMatch(/state === 'active'[\s\S]{0,120}get\(\)/);
  });

  it('re-reads on focus, without prompting', () => {
    const src = stripComments(fs.readFileSync(path.join(PERMISSIONS_DIR, 'use-media-access.ts'), 'utf8'));
    expect(src).toContain('useFocusEffect');
    // get(), not request() — asking on every focus would nag on every return.
    expect(src).toMatch(/useFocusEffect\([\s\S]{0,120}get\(\)/);
  });

  /*
    ⚠️ `null` is the third state. Read as "denied" it flashes a block at
    somebody who granted it; read as "we may ask" it offers a button that
    silently does nothing once the system has stopped prompting.
  */
  it('nothing infers "we may ask" from an unresolved permission', () => {
    const offenders = ALL
      .filter((f) => !f.startsWith(PERMISSIONS_DIR))
      .filter((f) => stripComments(fs.readFileSync(f, 'utf8')).includes('canAskAgain'))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('a viewfinder never renders before the answer is known', () => {
    // `if (permission && !permission.granted)` was FALSE while unresolved, so
    // the scanner fell through and mounted the camera first. The gate must be
    // false-for-null, which `!x.granted` is and `x && !x.granted` is not.
    const offenders = ALL
      .filter((f) => stripComments(fs.readFileSync(f, 'utf8')).includes('<CameraView'))
      .filter((f) => !/if \(!\w+\.granted\)|if \(stage === 'camera' && !\w+\.granted\)/.test(
        stripComments(fs.readFileSync(f, 'utf8')),
      ))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe('one screen, one sheet, every surface', () => {
  it('no screen ships its own permission UI', () => {
    // The old bespoke copies are gone, not merely unused.
    expect(fs.existsSync(path.join(MOBILE, 'src/components/scan/camera-permission-screen.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(MOBILE, 'src/hooks/use-camera-access.ts'))).toBe(false);
  });

  it('the picker sheet is mounted exactly once, app-wide', () => {
    const hosts = ALL.filter((f) => /<MediaAccessHost\s*\/>/.test(fs.readFileSync(f, 'utf8')));
    expect(hosts.map(rel)).toHaveLength(1);
  });

  it('the image picker no longer explains itself in hard-coded English', () => {
    const src = fs.readFileSync(path.join(MOBILE, 'src/hooks/useImagePicker.ts'), 'utf8');
    expect(src).not.toContain('Permission Required');
    expect(stripComments(src)).toContain('requestMediaAccess');
  });
});
