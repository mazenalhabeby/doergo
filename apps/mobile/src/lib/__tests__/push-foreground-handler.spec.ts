/**
 * A notification that arrives while the app is open is shown.
 *
 * expo-notifications shows nothing in the foreground unless a handler says so.
 * The handler was once deleted by an unrelated edit to the same file and went
 * out over the air: every banner while the app was open went silent, with no
 * error anywhere. This reads the hook and fails if it is gone.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('foreground notifications', () => {
  it('the push hook registers a handler that shows them', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../hooks/usePushNotifications.ts'), 'utf8');
    expect(src).toMatch(/Notifications\.setNotificationHandler\(/);
    expect(src).toMatch(/shouldShowBanner:/);
  });
});
