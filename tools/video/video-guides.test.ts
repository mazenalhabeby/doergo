/**
 * Guards for the two things about this pipeline that fail SILENTLY.
 *
 *   node --test tools/video/video-guides.test.ts
 *
 * 1. A video keyed to a tour id that no longer exists. Nothing throws — the
 *    lookup simply returns undefined forever, and the link never appears on
 *    the screen it was made for. Nobody notices until somebody asks why the
 *    video they recorded is not on the page.
 *
 * 2. A real person's details reaching the demo data. The whole reason a
 *    separate organisation exists is that these videos are published publicly
 *    and cannot be unpublished. A `@gmail.com` address pasted into the cast
 *    while borrowing a name would not break anything, which is exactly what
 *    makes it dangerous.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const REGISTRY = path.join(REPO, 'apps/web-app/src/components/tour/registry.ts');
const GUIDES = path.join(REPO, 'packages/shared/src/video-guides.ts');

/**
 * Strip comments before scanning.
 *
 * ⚠️ Not optional. Both files document their ids in prose, and the first
 * version of this test matched an example inside a doc comment — reporting a
 * tour that does not exist, from a file that was correct.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function registryTourIds(): Set<string> {
  const src = withoutComments(fs.readFileSync(REGISTRY, 'utf8'));
  const ids = new Set<string>();
  // Explicit definitions: `id: "tasksTour"`.
  for (const m of src.matchAll(/\bid:\s*"([A-Za-z][A-Za-z0-9]*)"/g)) ids.add(m[1]!);
  // The page-hint helper: `...pageTour("pageInvoices", ...)`.
  for (const m of src.matchAll(/pageTour\(\s*"([A-Za-z][A-Za-z0-9]*)"/g)) ids.add(m[1]!);
  return ids;
}

function declaredTourIds(): Set<string> {
  const src = withoutComments(fs.readFileSync(GUIDES, 'utf8'));
  const union = src.match(/export type TourId =([\s\S]*?);/);
  assert.ok(union, 'video-guides.ts no longer declares a TourId union');
  return new Set([...union[1]!.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map((m) => m[1]!));
}

test('every TourId is a tour that actually exists', () => {
  const real = registryTourIds();
  assert.ok(real.size >= 20, `only found ${real.size} tours — did the registry format change?`);
  for (const id of declaredTourIds()) {
    assert.ok(real.has(id), `TourId "${id}" is not in the web app's tour registry`);
  }
});

test('every tour in the registry is accounted for in TourId', () => {
  // Not "has a video" — just "is known about", so adding a tour surfaces the
  // question of whether it deserves one rather than being missed silently.
  const declared = declaredTourIds();
  for (const id of registryTourIds()) {
    assert.ok(declared.has(id), `Tour "${id}" is missing from the TourId union in video-guides.ts`);
  }
});

test('every script names real tours and a registered flow', () => {
  const real = registryTourIds();
  const scriptsDir = path.join(HERE, 'scripts');
  const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0, 'no video scripts found');

  const renderSrc = withoutComments(fs.readFileSync(path.join(HERE, 'render.ts'), 'utf8'));
  const LOCALES = ['en', 'de', 'es', 'fr', 'it'];

  for (const file of files) {
    const script = JSON.parse(fs.readFileSync(path.join(scriptsDir, file), 'utf8'));

    for (const tourId of script.tourIds) {
      assert.ok(real.has(tourId), `${file}: names tour "${tourId}", which does not exist`);
    }

    assert.ok(
      renderSrc.includes(`'${script.id}':`),
      `${file}: no capture flow registered in render.ts for "${script.id}"`,
    );

    // A missing locale means that language's viewers get no subtitles at all,
    // and nothing else in the pipeline would notice.
    for (const field of ['title', 'subtitle', 'description'] as const) {
      for (const locale of LOCALES) {
        assert.ok(script[field]?.[locale], `${file}: ${field} is missing "${locale}"`);
      }
    }
    for (const beat of script.beats) {
      for (const locale of LOCALES) {
        assert.ok(
          beat.narration?.[locale],
          `${file}: beat "${beat.id}" narration is missing "${locale}"`,
        );
      }
    }
  }
});

test('the demo cast contains nobody real', () => {
  const src = fs.readFileSync(path.join(HERE, 'demo-data.ts'), 'utf8');

  /*
    Email: `.example` is reserved by RFC 2606 and can never be delivered to or
    registered. Anything else — however unlikely-looking — is a domain
    somebody can own, and an address there may be a real person's.
  */
  for (const m of src.matchAll(/'[^']*@([A-Za-z0-9.-]+)'/g)) {
    assert.ok(
      m[1]!.endsWith('.example'),
      `demo-data.ts contains "${m[0]}" — every demo address must end in .example`,
    );
  }

  /*
    Phone: Ofcom's drama ranges, +44 7700 900000-900999 and
    +44 20 7946 0000-0999, are the only numbers a European regulator
    permanently withholds from allocation. A merely implausible number is
    somebody's line.
  */
  for (const m of src.matchAll(/'(\+\d[\d ]{6,})'/g)) {
    const digits = m[1]!.replace(/\s/g, '');
    const reserved = /^\+447700900\d{3}$/.test(digits) || /^\+442079460\d{3}$/.test(digits);
    assert.ok(reserved, `demo-data.ts contains "${m[1]}" — use an Ofcom drama number`);
  }
});
