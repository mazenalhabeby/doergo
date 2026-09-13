/**
 * A binary built BEFORE the key library shipped.
 *
 * ⚠️ The library binds with `TurboModuleRegistry.getEnforcing` when it is
 * evaluated, so a top-level import threw before React mounted and the app died
 * on launch — in a stale dev client, and over the air on every store build.
 * The library mock below throws exactly like that; the graph must never load it.
 */
jest.mock('@sbaiahmed1/react-native-biometrics', () => {
  throw new Error("TurboModuleRegistry.getEnforcing(...): 'ReactNativeBiometrics' could not be found.");
});
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('device-1'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afu',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'wu',
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  getEnrolledLevelAsync: jest.fn().mockResolvedValue(3),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([1]),
  authenticateAsync: jest.fn(),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('expo-device', () => ({ modelName: 'Old Build' }));
jest.mock('../../api/client', () => ({
  API_URL: 'http://test', getAccessToken: jest.fn(), getRefreshToken: jest.fn(), saveTokens: jest.fn(),
}));
jest.mock('../../../i18n', () => ({ t: (k: string) => k }));

describe('biometrics without the native key module', () => {
  it('imports the whole graph without touching the library', () => {
    expect(() => require('../index')).not.toThrow();
  });

  it('is not offered, even on a phone with a strong sensor', async () => {
    const { resolveCapability } = require('../index');
    await expect(resolveCapability()).resolves.toEqual({ kind: 'unavailable' });
  });

  it('reads as not enrolled, and forgetting still clears local state', async () => {
    const { biometricCredential } = require('../index');
    await expect(biometricCredential.isEnrolled()).resolves.toBe(false);
    await expect(biometricCredential.forget()).resolves.toBeUndefined();
    expect(require('expo-secure-store').deleteItemAsync).toHaveBeenCalled();
  });

  it('refuses to unlock with a failure the screens already handle', async () => {
    const { biometricCredential } = require('../index');
    await expect(biometricCredential.unlock()).rejects.toMatchObject({ failure: 'not-enrolled' });
  });
});
