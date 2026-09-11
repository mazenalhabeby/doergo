import { execFileSync } from 'child_process';
import path from 'path';

/**
 * Hooks are called in the same order every render — checked, not hoped.
 *
 * ⚠️ A MEMBER'S APP CRASHED ON THIS. `update-banner.tsx` called `useState` and
 * `useEffect` BELOW an early `return null`, next to the markup that used them,
 * which reads perfectly naturally. React counts hooks per render and this
 * component returns null on most of them, so the first render that got past the
 * guard called two more than the one before: "Rendered more hooks than during
 * the previous render", a red screen, and no way out but force-quitting.
 *
 * It was harmless for as long as the banner never appeared, and detonated
 * within hours of the banner being fixed to appear. A latent crash behind a
 * feature that does not run is still a crash — shipping the feature ships it.
 *
 * ⚠️ And nothing was checking. There was NO eslint config in this app at all:
 * `pnpm lint` exited on "couldn't find eslint.config.js", so the one rule that
 * names this exact mistake had never run once. The config exists now; this
 * makes it run where the rest of the guards run, because a lint nobody invokes
 * is the state we were already in.
 */
describe('rules of hooks', () => {
  // ESLint is not fast, and it is a whole process. One run, shared.
  jest.setTimeout(180_000);

  interface Message { ruleId: string | null; severity: number; line: number; message: string }
  interface Result { filePath: string; messages: Message[] }
  let results: Result[];

  beforeAll(() => {
    const cwd = path.join(__dirname, '../../..');
    /*
      A SUBPROCESS, not ESLint's Node API.

      The flat config is `.mjs`, and Jest's CJS runtime cannot dynamically
      import it without `--experimental-vm-modules` — the API route fails with
      "A dynamic import callback was invoked without…". Shelling out also means
      this checks exactly what `pnpm lint` checks, rather than a second
      configuration that can drift from it.
    */
    let stdout: string;
    try {
      stdout = execFileSync(
        'npx',
        ['eslint', 'src', 'app', '--format', 'json', '--rule', '{"react-hooks/exhaustive-deps":"off"}'],
        { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      );
    } catch (err: any) {
      // A non-zero exit is how ESLint reports findings; the report is still on
      // stdout and is exactly what this suite is here to read.
      stdout = err.stdout ?? '';
    }
    results = JSON.parse(stdout || '[]');
  });

  it('checks a real number of files — an empty run would pass anything', () => {
    expect(results.length).toBeGreaterThan(50);
  });

  it('no component calls a hook conditionally', () => {
    const offenders = results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === 'react-hooks/rules-of-hooks')
        .map((m) => `${r.filePath.split('/apps/mobile/')[1]}:${m.line} ${m.message}`),
    );
    expect(offenders).toEqual([]);
  });

  it('has nothing else erroring either, so the lint stays worth running', () => {
    // A config that reports known-false errors is a config whose output nobody
    // reads — which is how `useMyLocation`, a plain async function named like a
    // hook, kept two permanent errors on one screen.
    const errors = results.flatMap((r) =>
      r.messages
        .filter((m) => m.severity === 2)
        .map((m) => `${r.filePath.split('/apps/mobile/')[1]}:${m.line} ${m.ruleId}`),
    );
    expect(errors).toEqual([]);
  });
});
