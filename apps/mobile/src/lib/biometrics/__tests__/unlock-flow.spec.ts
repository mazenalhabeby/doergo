/**
 * The performance claim, as a test.
 *
 * "One prompt on both platforms" is the entire reason the device-bound keypair
 * replaced the stored refresh token — a rotating token is spent on use and must
 * be rewritten, and Android requires authentication on EVERY SecureStore
 * operation, so that route cost TWO prompts per unlock.
 *
 * A claim nobody measures is a claim that quietly stops being true, so this
 * counts the prompts.
 */
const signWithOptions = jest.fn();
const createKeys = jest.fn();
const keyExists = jest.fn();

jest.mock('@sbaiahmed1/react-native-biometrics', () => ({
  createKeys: (...a: unknown[]) => createKeys(...a),
  deleteKeys: jest.fn().mockResolvedValue(undefined),
  keyExists: (...a: unknown[]) => keyExists(...a),
  signWithOptions: (...a: unknown[]) => signWithOptions(...a),
  BiometricStrength: { Strong: 'strong' },
  InputEncoding: { Base64: 'base64' },
}));
// The native side is present in these specs; `no-native-module.spec.ts` covers its absence.
jest.mock('../native', () => ({
  deviceKeyModule: () => require('@sbaiahmed1/react-native-biometrics'),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('device-1'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afu',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'wu',
}));
jest.mock('expo-local-authentication', () => ({ authenticateAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('expo-device', () => ({ modelName: 'Pixel' }));
const saveTokens = jest.fn();
jest.mock('../../api/client', () => ({
  API_URL: 'http://test',
  getAccessToken: jest.fn().mockResolvedValue('access'),
  getRefreshToken: jest.fn(),
  saveTokens: (...a: unknown[]) => saveTokens(...a),
}));
jest.mock('../../../i18n', () => ({ t: (k: string) => k }));

describe('unlock costs exactly one prompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async (url: any) => {
      if (String(url).includes('challenge')) {
        return { ok: true, json: async () => ({ data: { challenge: 'Y2hhbGxlbmdl' } }) } as any;
      }
      return { ok: true, json: async () => ({ data: { accessToken: 'a', refreshToken: 'r' } }) } as any;
    }) as any;
  });

  it('prompts once and signs the DECODED nonce bytes', async () => {
    signWithOptions.mockResolvedValue({ success: true, signature: 'sig' });
    const { DeviceKeyCredential } = require('../device-key-credential');

    await new DeviceKeyCredential().unlock();

    // The whole point: one biometric interaction, not two.
    expect(signWithOptions).toHaveBeenCalledTimes(1);

    const opts = signWithOptions.mock.calls[0][0];
    // ⚠️ Base64 in, or the device signs the characters while the server
    // verifies the bytes — every signature rejected, both sides looking right.
    expect(opts.inputEncoding).toBe('base64');
    // Class 3 at signing time, and no PIN standing in for the biometric.
    expect(opts.biometricStrength).toBe('strong');
    expect(opts.disableDeviceFallback).toBe(true);

    expect(saveTokens).toHaveBeenCalledWith('a', 'r');
  });

  it('makes exactly two round trips — challenge, then verify', async () => {
    signWithOptions.mockResolvedValue({ success: true, signature: 'sig' });
    const { DeviceKeyCredential } = require('../device-key-credential');
    await new DeviceKeyCredential().unlock();
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2);
  });

  it('a cancelled prompt does not destroy the key', async () => {
    signWithOptions.mockRejectedValue(new Error('User canceled'));
    const { DeviceKeyCredential } = require('../device-key-credential');
    const { deleteKeys } = require('@sbaiahmed1/react-native-biometrics');
    await expect(new DeviceKeyCredential().unlock()).rejects.toMatchObject({ failure: 'cancelled' });
    // Cancelling is a decision, not a fault — re-enrolling after every
    // dismissed prompt would make the feature unusable.
    expect(deleteKeys).not.toHaveBeenCalled();
  });
});

/**
 * ⚠️ What a failed prompt means, by the codes each platform actually returns.
 * The old rule read the MESSAGE, and iOS reports a Face ID cancel as
 * SIGNATURE_CREATION_FAILED — so one dismissed prompt erased the binding.
 */
describe('a failed prompt only deletes the key on proof', () => {
  const run = async (signed: unknown) => {
    const { deleteKeys } = require('@sbaiahmed1/react-native-biometrics');
    deleteKeys.mockClear();
    signWithOptions.mockResolvedValue(signed);
    const { DeviceKeyCredential } = require('../device-key-credential');
    const err = await new DeviceKeyCredential().unlock().catch((e: unknown) => e);
    return { failure: (err as { failure: string }).failure, deleted: deleteKeys.mock.calls.length > 0 };
  };

  it.each([
    ['iOS cancel', { success: false, errorCode: 'USER_CANCEL', error: 'User canceled authentication' }],
    ['Android cancel', { success: false, errorCode: 'USER_CANCELED', error: 'Cancel' }],
    ['iOS app sent to background', { success: false, errorCode: 'SYSTEM_CANCEL', error: 'System canceled authentication' }],
  ])('%s → cancelled, key kept', async (_, signed) => {
    expect(await run(signed)).toEqual({ failure: 'cancelled', deleted: false });
  });

  it.each([
    ['iOS Face ID cancel inside SecKeyCreateSignature', { success: false, errorCode: 'SIGNATURE_CREATION_FAILED', error: 'Failed to create digital signature' }],
    ['iOS lockout', { success: false, errorCode: 'BIOMETRY_LOCKOUT', error: 'Biometry is locked out' }],
    ['iOS face not recognised', { success: false, errorCode: 'AUTHENTICATION_FAILED', error: 'Authentication failed' }],
    ['Android lockout', { success: false, errorCode: 'BIOMETRIC_LOCKOUT', error: 'Too many attempts' }],
  ])('%s → failed, key kept', async (_, signed) => {
    expect(await run(signed)).toEqual({ failure: 'failed', deleted: false });
  });

  it.each([
    ['iOS enrolment changed', { success: false, errorCode: 'BIOMETRY_CURRENT_SET_CHANGED', error: 'Biometric enrollment changed' }],
    ['key missing', { success: false, errorCode: 'KEY_NOT_FOUND', error: 'Key not found' }],
    ['Android fingerprint added', { success: false, errorCode: 'SIGNATURE_CREATION_FAILED', error: 'Failed to generate signature: Key permanently invalidated' }],
  ])('%s → invalidated, key deleted', async (_, signed) => {
    expect(await run(signed)).toEqual({ failure: 'invalidated', deleted: true });
  });
});
