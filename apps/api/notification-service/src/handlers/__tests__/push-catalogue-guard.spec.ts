import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PUSH_MESSAGES } from '../../i18n/push-messages';

/**
 * Nothing sends a push, or files a bell entry, in a language it chose itself.
 *
 * The types already make it awkward — `sendToUsers` takes a LocalizedText, not
 * a string — but an `as any`, a new helper that takes `title: string`, or a
 * bell entry built beside the push are all ways English comes back, and they
 * come back quietly: the phone shows a perfectly good sentence to somebody who
 * cannot read it. So this reads the source.
 *
 * Proven by planting: a handler calling
 *   `this.pushService.sendToUser(id, 'Hello', 'World')`
 * or recording `{ title: 'Hello' }` fails the first two checks; a `msg('typo.key')`
 * fails the third.
 */
const SRC = join(__dirname, '..', '..');

function sources(): Array<{ file: string; code: string }> {
  const handlers = readdirSync(join(SRC, 'handlers'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(SRC, 'handlers', f));
  return [
    ...handlers,
    join(SRC, 'modules', 'push', 'push.service.ts'),
    join(SRC, 'common', 'notification-store.service.ts'),
    join(SRC, 'notification.controller.ts'),
  ].map((file) => ({ file: file.slice(SRC.length + 1), code: stripComments(readFileSync(file, 'utf8')) }));
}

/** Comments explain what a push says, in English, and must not count as one. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const STRING_START = `['"\`]`;

describe('push catalogue guard', () => {
  const files = sources();

  it('finds the sources it is meant to police', () => {
    expect(files.map((f) => f.file)).toEqual(
      expect.arrayContaining([
        'handlers/attendance-notification.handler.ts',
        'handlers/task-notification.handler.ts',
        'modules/push/push.service.ts',
      ]),
    );
  });

  it('never gives a push or a bell entry a literal title or body', () => {
    const literal = new RegExp(`\\b(title|body)\\s*:\\s*${STRING_START}`, 'g');
    const offenders = files.flatMap(({ file, code }) =>
      [...code.matchAll(literal)].map((m) => `${file}: ${code.slice(m.index!, m.index! + 60).split('\n')[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it('never passes a string straight to a send call', () => {
    const direct = new RegExp(`\\.sendToUsers?\\(\\s*[^,()]+,\\s*${STRING_START}`, 'g');
    const offenders = files.flatMap(({ file, code }) =>
      [...code.matchAll(direct)].map((m) => `${file}: ${code.slice(m.index!, m.index! + 60).split('\n')[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it('has exactly one place that hands rendered text to Expo', () => {
    const senders = files.filter(({ code }) => /sendPushNotificationsAsync|sendPushNotification\s*\(/.test(code));
    expect(senders.map((f) => f.file)).toEqual(['modules/push/push.service.ts']);
  });

  it('only names catalogue keys that exist', () => {
    const known = new Set(Object.keys(PUSH_MESSAGES.en));
    const named = new RegExp(`\\b(?:msg|plural)\\(\\s*${STRING_START}([\\w.]+)${STRING_START}`, 'g');
    const missing = files.flatMap(({ file, code }) =>
      [...code.matchAll(named)]
        .map((m) => m[1])
        .filter((key) => !known.has(key) && !known.has(`${key}.one`))
        .map((key) => `${file}: ${key}`),
    );
    expect(missing).toEqual([]);
  });

  it('builds every dynamic key from a prefix the catalogue actually has', () => {
    const known = Object.keys(PUSH_MESSAGES.en);
    const dynamic = /\bmsg\(\s*`([\w.]+)\.\$\{/g;
    const missing = files.flatMap(({ file, code }) =>
      [...code.matchAll(dynamic)]
        .map((m) => m[1])
        .filter((prefix) => !known.some((k) => k.startsWith(`${prefix}.`)))
        .map((prefix) => `${file}: ${prefix}.*`),
    );
    expect(missing).toEqual([]);
  });
});
