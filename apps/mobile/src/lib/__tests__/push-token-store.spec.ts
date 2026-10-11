jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => data.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => { data.set(k, v); }),
      removeItem: jest.fn(async (k: string) => { data.delete(k); }),
    },
  };
});

import { forgetPushToken, rememberPushToken, storedPushToken, storedRegistration } from '../push-token-store';

/*
  ⚠️ The registration is remembered as `token|language`; the token sent to the
  server to REMOVE it must be the bare token. Sending the whole string matched
  nothing, so from 2026-09-15 signing out never stopped the notifications.
*/
describe('push token store', () => {
  beforeEach(() => forgetPushToken());

  it('hands out the bare token for removal, whatever language was registered', async () => {
    await rememberPushToken('ExponentPushToken[abc]|de');
    expect(await storedPushToken()).toBe('ExponentPushToken[abc]');
  });

  it('keeps the full registration for the "register again?" check', async () => {
    await rememberPushToken('ExponentPushToken[abc]|de');
    expect(await storedRegistration()).toBe('ExponentPushToken[abc]|de');
  });

  it('reads a registration saved before languages were added', async () => {
    await rememberPushToken('ExponentPushToken[abc]');
    expect(await storedPushToken()).toBe('ExponentPushToken[abc]');
  });

  it('has nothing to remove once forgotten', async () => {
    await rememberPushToken('ExponentPushToken[abc]|en');
    await forgetPushToken();
    expect(await storedPushToken()).toBeNull();
  });
});
