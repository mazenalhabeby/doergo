/**
 * Does importing this module graph actually WORK?
 *
 * ⚠️ This test exists because a circular import froze the app on its splash
 * screen and NOTHING caught it: tsc was clean, eslint was clean, and
 * `expo export` bundled successfully — bundling packages modules, it never
 * evaluates them. Three builds shipped before a device revealed it.
 *
 * So: evaluate the graph, and assert the exported instance is usable. A cycle
 * leaves it `undefined`, and this fails.
 */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afu-tdo',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'wu-tdo',
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  getEnrolledLevelAsync: jest.fn().mockResolvedValue(3),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([1]),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('expo-device', () => ({ modelName: 'Test Phone' }));
jest.mock('@sbaiahmed1/react-native-biometrics', () => ({
  createKeys: jest.fn(), deleteKeys: jest.fn(), keyExists: jest.fn().mockResolvedValue(false),
  signWithOptions: jest.fn(), BiometricStrength: { Strong: 'strong' }, InputEncoding: { Base64: 'base64' },
}));
jest.mock('../../api/client', () => ({
  API_URL: 'http://test', getAccessToken: jest.fn(), getRefreshToken: jest.fn(), saveTokens: jest.fn(),
}));
jest.mock('../../../i18n', () => ({ t: (k: string) => k }));

describe('biometrics module graph', () => {
  it('initialises without a cycle leaving anything undefined', () => {
    const m = require('../index');
    // The symptom of the cycle: the chooser ran `new Undefined()` at module
    // scope and the whole import threw before React mounted.
    expect(m.biometricCredential).toBeDefined();
    expect(typeof m.biometricCredential.isEnrolled).toBe('function');
    expect(m.getBiometricCredential().kind).toBe('device-key');
    // The error class must be real, not a half-initialised binding.
    expect(new m.BiometricError('cancelled').failure).toBe('cancelled');
  });

  it('reports unavailable rather than throwing when the platform refuses', async () => {
    const la = require('expo-local-authentication');
    la.hasHardwareAsync.mockRejectedValueOnce(new Error('no module'));
    const { resolveCapability } = require('../index');
    await expect(resolveCapability()).resolves.toEqual({ kind: 'unavailable' });
  });
});
