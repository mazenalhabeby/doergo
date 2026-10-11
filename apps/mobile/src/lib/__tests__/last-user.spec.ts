jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

import { shouldAutoPromptFor } from '../session/last-user';

/*
  ⚠️ The fingerprint key belongs to whoever enrolled it. If a colleague signed
  in on the same phone since, opening the prompt by itself put them one touch
  away from the FIRST person's account.
*/
describe('when the login screen opens the fingerprint prompt by itself', () => {
  const mike = { userId: 'mike', email: 'mike@example.com' };
  const sarah = { userId: 'sarah', email: 'sarah@example.com' };

  it('does, for the owner when they were also the last one here', () => {
    expect(shouldAutoPromptFor('mike', mike)).toBe(true);
  });

  it('does not, when somebody else signed in on this phone since', () => {
    expect(shouldAutoPromptFor('mike', sarah)).toBe(false);
  });

  it('does, on a phone that has no record yet (an update from an older app)', () => {
    expect(shouldAutoPromptFor('mike', null)).toBe(true);
  });

  it('does not when no account owns the key', () => {
    expect(shouldAutoPromptFor(null, mike)).toBe(false);
  });
});
