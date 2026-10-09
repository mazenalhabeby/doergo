import fs from 'fs';
import path from 'path';

/**
 * The offline-mode switch rides on every session the app can hold.
 *
 * Three places build a request context (sign-in, refresh, token validation).
 * Missing it on one reads as "off" on that path — a member whose app refreshed
 * its session would silently lose offline mode an hour into a shift. The same
 * three places carry `orgAddOns`, so the two counts must match, and every
 * organization select feeding them must read the column.
 */
describe('offlineMode on the request context', () => {
  /*
    Authentication is a facade over collaborators (sign-in, refresh, token
    validation each build a context in their own file), so every service file
    in the module is read — the counts must match across all of them.
  */
  const dir = path.join(__dirname, '..');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.service.ts'));
  const src = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

  it('reads the files that build a context', () => {
    expect(files).toEqual(
      expect.arrayContaining(['auth.service.ts', 'session-tokens.service.ts', 'sessions.service.ts', 'token-validation.service.ts']),
    );
  });

  it('is set wherever orgAddOns is', () => {
    const addOns = src.match(/^\s+orgAddOns:\s[a-zA-Z]/gm)?.length ?? 0;
    const offline = src.match(/^\s+offlineMode:\s[a-zA-Z]/gm)?.length ?? 0;
    expect(addOns).toBeGreaterThanOrEqual(3);
    expect(offline).toBe(addOns);
  });

  it('is read by every organization select that feeds a context', () => {
    const selects = src.match(/organization: \{ select: \{[^}]*addOns: true[^}]*\}/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    for (const sel of selects) expect(sel).toContain('offlineMode: true');
  });
});
