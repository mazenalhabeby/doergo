import { HomeScreen } from '@/features/home/home-screen';

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
 * ⚠️ THE FOUR OLD SCREENS ARE DELETED. They are in HEAD and nowhere else —
 * this comment used to say they were "not yet deleted", and it went on saying
 * it after they were gone.
 *
 *     git show HEAD:apps/mobile/src/components/home/admin-dashboard.tsx
 *     git show HEAD:apps/mobile/src/components/home/site-pulse.tsx
 *     git show HEAD:apps/mobile/src/components/home/crew-line.tsx
 *     git show HEAD:apps/mobile/src/components/home/needs-list.tsx
 *
 * `crew`, `my-work`, `my-route`, `needs-you` and `clients` are not all built
 * yet, so the oversight and task surfaces those screens carried still have no
 * replacement — but the reference for building them is git, not the working
 * tree. Do not put any of it back in the barrel: removing them took 72 require
 * cycles out, and reference material does not need to be reachable code.
 * See `docs/design/README.md` §5 for the order.
 */
export default function HomeTab() {
  return <HomeScreen />;
}
