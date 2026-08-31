import { mayClockInRemotely } from '@hbcfield/shared';

/**
 * Who may clock in without a geofence.
 *
 * Reported from production: an admin opened the clock, was asked for GPS, and
 * had no way to say "I am working from home" — while the API would have accepted
 * exactly that. The server had always read `allowRemote || role === ADMIN`; all
 * three clock surfaces (web attendance page, web widget, mobile) checked
 * `allowRemote` alone.
 *
 * Nobody wrote the rule down twice on purpose — it was copied three times and
 * the admin half was dropped somewhere along the way, which is what a shared
 * predicate prevents. These tests belong to the rule, not to any one screen.
 */
describe('mayClockInRemotely', () => {
  it('lets an admin clock in remotely with nothing configured', () => {
    // The Access screen offers no switch for this, deliberately: there is nobody
    // above an admin to grant it. So the rule must grant it, or it is ungrantable.
    expect(mayClockInRemotely({ role: 'ADMIN', allowRemote: false })).toBe(true);
    expect(mayClockInRemotely({ role: 'ADMIN' })).toBe(true);
  });

  it('lets a member with the explicit grant', () => {
    expect(mayClockInRemotely({ role: 'EMPLOYEE', allowRemote: true })).toBe(true);
  });

  it('refuses a member without it', () => {
    expect(mayClockInRemotely({ role: 'EMPLOYEE', allowRemote: false })).toBe(false);
    expect(mayClockInRemotely({ role: 'EMPLOYEE' })).toBe(false);
  });

  it('refuses when there is no user at all', () => {
    // A logged-out or still-loading client must not render the button hopefully.
    expect(mayClockInRemotely(null)).toBe(false);
    expect(mayClockInRemotely(undefined)).toBe(false);
  });

  it('does not treat a customer as an admin', () => {
    expect(mayClockInRemotely({ role: 'CUSTOMER', allowRemote: false })).toBe(false);
  });

  it('is not fooled by a truthy non-boolean', () => {
    // `allowRemote` arrives off JSON on the clients; only a real true grants it.
    expect(mayClockInRemotely({ role: 'EMPLOYEE', allowRemote: 1 as unknown as boolean })).toBe(false);
  });
});
