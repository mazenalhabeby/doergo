'use client';

import { AnimatedLogo } from '@hbcfield/shared/components';

/**
 * The moment before the app knows who you are.
 *
 * ⚠️ This was the DASHBOARD SKELETON — a navbar, a sidebar and a grid of content
 * cards — drawn while the auth check was still running. For somebody who is
 * signed in that is a fair guess at what comes next. For somebody who is NOT, it
 * is a picture of an application they cannot enter, shown for a moment and then
 * replaced by the login page. Signing out gave the same flash in reverse.
 *
 * While the answer is unknown, the honest screen belongs to NEITHER side: the
 * mark on the ground the auth pages already use, so the transition into login is
 * a fade rather than a rearrangement, and a signed-in user sees the same quiet
 * half-second they would have spent looking at a fake navbar.
 *
 * `force-light` and the gradient are the auth layout's own, deliberately — this
 * is what login is about to look like.
 */
export function BootScreen() {
  return (
    <div
      className="force-light flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 p-4"
      // A screen reader should hear that something is loading, not read a logo.
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading</span>
      <div className="animate-in fade-in duration-300">
        <AnimatedLogo size="large" />
      </div>
    </div>
  );
}
