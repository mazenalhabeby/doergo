import { HomeScreen } from '../../../src/home/home-screen';

/**
 * ONE home, composed from a registry.
 *
 * This file used to branch four ways — `oversees(user)` to the admin
 * dashboard, then modules to one of three member homes — and each of those
 * four screens carried its own fetching, its own skeletons and its own error
 * handling. They also carried the same bug, four times, because the logic was
 * written four times and fixed once.
 *
 * ⚠️ The branch is gone rather than moved. What varies between people is not
 * their `Role` — it is what they DO, and `Role` is only
 * `ADMIN | EMPLOYEE | CUSTOMER` since 2026-07-16, with everything meaningful
 * living in an `AccessRole`. So entitlement FILTERS one ordered list of
 * widgets; it does not fork into a screen per kind of person.
 *
 * The four old screens still exist and are not yet deleted — `crew`,
 * `my-work`, `my-route`, `needs-you` and `clients` are not built yet, and
 * until they are, the oversight and task surfaces they carry have no
 * replacement. See `docs/design/README.md` §5 for the order.
 */
export default function HomeTab() {
  return <HomeScreen />;
}
