/**
 * Every gateway controller module can be loaded.
 *
 * A type used in a route's decorator metadata is read when the controller class
 * is DEFINED. Declare a DTO class below the controller in the same file and the
 * module throws on import — tsc is happy, unit tests that never import the file
 * are happy, and the gateway dies on start (it happened with OfflineModeDto).
 * Requiring each controller here makes that a test failure instead.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');

function* controllers(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') yield* controllers(full);
    } else if (e.name.endsWith('.controller.ts')) yield full;
  }
}

describe('gateway controllers', () => {
  const files = [...controllers(SRC)];

  it('finds the controllers', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(files.map((f) => [path.relative(SRC, f), f]))('%s loads', (_rel, file) => {
    expect(() => jest.isolateModules(() => require(file))).not.toThrow();
  });
});
