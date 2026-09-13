/**
 * Signing out must not destroy the fingerprint binding.
 *
 * ⚠️ Reported from a device: enable fingerprint, sign out, and the fingerprint
 * button is gone and the switch reads off. `clearStorage()` called
 * `biometricCredential.forget()` on every sign-out, and the login screen — the
 * only place the key is ever used — is reached BY signing out.
 *
 * A source check, because the auth context is React and these specs are not.
 */
import * as fs from 'fs';
import * as path from 'path';

const MOBILE = path.resolve(__dirname, '../../../..');
const read = (p: string) =>
  fs.readFileSync(path.join(MOBILE, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('sign-out keeps the device key', () => {
  it('forgets only when the caller asks for it', () => {
    const ctx = read('src/contexts/auth-context.tsx');
    const calls = ctx.match(/biometricCredential\.forget\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(ctx).toMatch(/forgetBiometrics\s*\?\s*biometricCredential\.forget\(\)/);
  });

  it('account deletion is the one sign-out that asks', () => {
    expect(read('app/(app)/profile/account.tsx')).toContain('logout({ forgetBiometrics: true })');
  });

  it('the login screen does not auto-prompt straight after a sign-out', () => {
    expect(read('app/(auth)/login.tsx')).toMatch(/promptedRef\.current \|\| signedOutByUser/);
  });
});
