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
import { readSource } from '../../../test-utils/read-source';

const MOBILE = path.resolve(__dirname, '../../../..');
const read = (p: string) =>
  readSource(path.join(MOBILE, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('sign-out keeps the device key', () => {
  it('forgets only when the account itself is deleted', () => {
    // Every exit goes through endSession now; it is the only place the key is forgotten.
    expect(read('src/contexts/auth-context.tsx')).not.toMatch(/biometricCredential\.forget\(\)/);
    const end = read('src/lib/session/end-session.ts');
    const calls = end.match(/biometricCredential\.forget\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(end).toMatch(/if \(reason === 'account-deleted'\) \{\s*await quietly\(biometricCredential\.forget\(\)\);/);
  });

  it('account deletion is the one sign-out that asks', () => {
    expect(read('src/components/settings/account-page.tsx')).toContain("logout({ reason: 'account-deleted' })");
  });

  it('the login screen does not auto-prompt straight after a sign-out', () => {
    // The sign-out check must come before the only place the prompt is opened.
    expect(read('app/(auth)/login.tsx')).toMatch(/if \(signedOutByUser\) return;\s*void unlockAndEnter\(\);/);
  });

  it('the login screen auto-prompts only for the person who used the phone last', () => {
    expect(read('app/(auth)/login.tsx')).toMatch(/if \(!shouldAutoPromptFor\(bio\.owner\?\.userId, lastUser\)\)/);
  });
});
