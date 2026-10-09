import * as fs from 'fs';
import * as path from 'path';

/*
  ONE mapping from a service's `{ success: false }` to an HTTP error.

  It was written by hand in about sixty places and the copies drifted: 400 here,
  500 there, and only one kept the refusal's `code` — so the phone could not
  translate the others. `assertServiceOk` (shared/microservices) is the mapping;
  a controller that throws `new HttpException` off `.success === false` is the
  drift starting again.

  Precise rather than shaped: ANY `success === false` (or `== false`) read in a
  controller is a hand mapping, whatever follows it — the first version looked
  only for `{ throw new HttpException` right after, so `res.status(...).json()`
  or a returned error object slipped past. Even the blog image, which streams
  bytes through `res`, throws through assertServiceOk before writing. Comments
  are stripped first, so a sentence about the pattern is not the pattern.
*/
const MODULES = path.resolve(__dirname, '../../modules');

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') yield* walk(full);
    } else if (e.name.endsWith('.controller.ts')) yield full;
  }
}

describe('service refusals', () => {
  it('are mapped by assertServiceOk, never by hand', () => {
    const offenders: string[] = [];
    for (const file of walk(MODULES)) {
      const code = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      const hand = /\.success\s*={2,3}\s*false\b|\bfalse\s*={2,3}\s*[\w.?]*\.success\b/;
      if (hand.test(code)) offenders.push(path.relative(MODULES, file));
    }
    expect(offenders).toEqual([]);
  });
});
