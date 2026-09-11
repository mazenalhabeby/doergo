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
 * ⚠️ IT USED TO BE `force-light`, pinned to the auth pages' own gradient on the
 * reasoning that "this is what login is about to look like". That reasoning
 * only holds for somebody who is signed OUT — and they are the rarer case. A
 * signed-in person opening the app hits this screen EVERY TIME while the auth
 * check runs, and if they work in dark mode they got a white flash before a
 * dark dashboard, on every single load. Reported from real use.
 *
 * So it follows the theme. The common path — signed in, dark — is now silent.
 * The trade is one flash the other way when somebody who is signed out and in
 * dark mode is handed to the light login page, which happens once per sign-in
 * rather than once per open.
 *
 * ⚠️ IN CSS, NOT JAVASCRIPT. The obvious version asks `hasTokens()` which way
 * this is going and picks a palette — but that reads localStorage, which does
 * not exist during the server render, so the server would emit one palette and
 * the client another: a hydration mismatch on the very first thing painted. The
 * theme class is already on `<html>` before first paint, so the cascade knows
 * the answer without anybody asking.
 */
export function BootScreen() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
      // A screen reader should hear that something is loading, not read a logo.
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading</span>
      {/*
        ⚠️ TWO LOGOS, ONE VISIBLE. The mark defaults to dark text, which on the
        dark ground below is invisible — a loading screen with nothing on it.
        `variant` is a prop, and choosing it needs to happen before first paint
        without JavaScript, so the cascade chooses: same reason the background
        is a `dark:` variant rather than a decision made in a hook.
      */}
      <div className="animate-in fade-in duration-300" aria-hidden="true">
        <span className="dark:hidden">
          <AnimatedLogo size="large" />
        </span>
        <span className="hidden dark:inline-block">
          <AnimatedLogo size="large" variant="light" />
        </span>
      </div>
    </div>
  );
}
