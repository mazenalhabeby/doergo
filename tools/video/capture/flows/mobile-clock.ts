/**
 * The first video shot on a phone: a field engineer starts a shift.
 *
 * Deliberately the same subject as `voice-test`, and for the same reason it
 * was chosen there — clocking in is two taps, needs no data set up beyond the
 * seed, and its result is visible on screen rather than in a database. What is
 * being tested here is the RIG, not the script, so the content is kept boring
 * on purpose: any failure belongs to the camera, not to the choreography.
 *
 * ⚠️ SELECTED BY VISIBLE TEXT, because the app carries no testIDs. That is
 * fragile in one specific way worth knowing: these strings come from the en
 * locale file, so a copy change renames the selector. The alternative — adding
 * testIDs across the app — is the right long-term answer and is a change to the
 * product, not to this tool, so it is not made here on the way past.
 *
 * ⚠️ THE DEVICE MUST BE STANDING ON THE DEPOT. The clock-in is re-checked
 * against the geofence on the server, so a device with no location — or one
 * still on the vendor's default somewhere in California — ends the video on a
 * refusal that looks like a product bug. `captureMobileClock` sets it before
 * filming, and the two platforms disagree about the argument order, which is
 * noted where it is done.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DEMO_LOGIN } from '../../config.ts';
import { DEPOT } from '../../demo-data.ts';
import { captureMobile, type MobileBeat, type Phone } from '../mobile-runner.ts';
import type { Timeline } from '../../timeline.ts';

const run = promisify(execFile);

const BEATS: MobileBeat[] = [
  {
    id: 'signIn',
    steps: [
      { tapOn: { text: 'you@company.com' } },
      { inputText: DEMO_LOGIN.email },
      { tapOn: { text: 'Enter your password' } },
      { inputText: DEMO_LOGIN.password },
      'hideKeyboard',
      { tapOn: { text: 'Sign in' } },
      /*
        The tab bar is the honest signal that sign-in landed. Waiting on a
        spinner to disappear would also pass while an error toast is on screen.
      */
      { extendedWaitUntil: { visible: { text: 'Attendance' }, timeout: 45000 } },
    ],
  },
  {
    id: 'openClock',
    steps: [
      { tapOn: { text: 'Attendance' } },
      { extendedWaitUntil: { visible: { text: 'Clock In' }, timeout: 30000 } },
    ],
  },
  {
    id: 'clockIn',
    steps: [
      { tapOn: { text: 'Clock In' } },
      // The swap to Clock Out is the only thing that proves the server took it.
      { extendedWaitUntil: { visible: { text: 'Clock Out' }, timeout: 30000 } },
    ],
  },
];

const ADB = process.env.VIDEO_ADB ?? `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;

export async function captureMobileClock(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const phone: Phone = (process.env.VIDEO_PHONE as Phone) ?? 'android';

  /*
    ⚠️ Set on the running device before the recorder starts. Both platforms
    keep it only until the device restarts, so a hand-run that skipped it would
    record fine once and then fail mysteriously on a fresh boot.

    ⚠️ The two take their arguments in OPPOSITE ORDERS — simctl wants
    latitude,longitude and `adb emu geo fix` wants longitude first. Swapping
    them puts the depot in the Atlantic, the clock-in is refused for being
    hundreds of miles from the workspace, and nothing on screen says why.
  */
  if (phone === 'ios') {
    await run('xcrun', ['simctl', 'location', 'booted', 'set', `${DEPOT.lat},${DEPOT.lng}`]);
  } else {
    await run(ADB, ['emu', 'geo', 'fix', String(DEPOT.lng), String(DEPOT.lat)]);
  }

  /*
    The Metro server the dev build should load from.
    ⚠️ The Mac's LAN address, never `localhost`: on an Android emulator
    localhost is the emulator, and the request would never leave the phone.
  */
  /*
    ⚠️ localhost, not this Mac's LAN address — `adb reverse` in the runner maps
    the device's own localhost to this machine. The LAN address was used first
    and failed silently when the Mac moved network mid-session: the app dialled
    an address that no longer existed and simply sat on the login screen.
  */
  const metro = process.env.VIDEO_METRO_URL ?? 'http://localhost:8081';
  /*
    ⚠️ RELEASE BY DEFAULT. Set VIDEO_DEV_BUILD=1 only to film a development
    build against Metro — it works, but it drags the expo developer menu into
    every take and needs a warm-up launch to tame. See the runner.
  */
  const devBuild = process.env.VIDEO_DEV_BUILD === '1';

  return captureMobile({
    narrationDurations,
    videoId: 'mobile-clock',
    phone,
    launchUrl: devBuild
      ? `hbcfield://expo-development-client/?url=${encodeURIComponent(metro)}`
      : undefined,
    /*
      ⚠️ Wait for the app to actually be there before the clock starts. A debug
      build fetches its whole JS bundle from Metro on a cold start, which is
      tens of seconds — and the first beat would otherwise tap at a splash
      screen and fail. Waiting on the SIGN-IN BUTTON rather than the email box
      on purpose: it is a real text node, where a placeholder is a hint and is
      not matched the same way on both platforms.

      It sits in setup, so those seconds are cut off the front of the film
      rather than narrated over.
    */
    /*
      ⚠️ Wait for the app to actually be there before the clock starts, even
      though the warm-up launch has already cached the bundle — a second launch
      is fast, not instant, and the first beat would otherwise tap at a splash
      screen. Waiting on the SIGN-IN BUTTON rather than the email box on
      purpose: it is a real text node, where a placeholder is a hint and is not
      matched the same way on both platforms.

      Nothing here dismisses a developer menu. That is deliberate — it is
      consumed by the warm-up launch in the runner, because doing it from
      inside the flow hangs Maestro. See the note there.
    */
    /*
      ⚠️ SEND THE EXPO DEVELOPER MENU AWAY, then wait for the app.

      Clearing storage for a logged-out start makes the app look freshly
      installed, and `expo-dev-client` greets that with its developer menu. It
      is dismissed HERE rather than during a warm-up launch because the warm-up
      has to guess when the menu has appeared, and guessing wrong let it arrive
      again in the middle of a take.

      ⚠️ THE SECOND TAP IS A POINT, NOT `back`. Tapping "Continue" only closes
      the onboarding sheet and reveals the menu behind it, whose ✕ carries no
      text to select. `back` closes it too — and reloads the bundle, after which
      Maestro's own backPress never returns (observed: hung 90 s, then killed).
      A tap on the ✕ closes the menu without reloading anything.

      Both are conditional: a release build has no dev client and neither will
      appear. All of it sits in setup, so none of it is filmed.
    */
    /*
      ⚠️ EVERY WAIT HERE POLLS; NONE OF THEM BURNS CPU. The first version held
      the screen with the same busy-wait the beats use, and the app went
      Application Not Responding: that loop spins a core on the HOST, and with
      an emulator, Metro, a Next dev server and Docker already sharing this
      machine, it starved the app while it was fetching its bundle. A beat can
      afford it — by then the app is loaded and idle — but setup cannot, because
      setup is exactly when the app is working hardest.

      ⚠️ Unconditional, not `runFlow ... when:`. Clearing storage makes a debug
      build look freshly installed every time, so `expo-dev-client` ALWAYS shows
      its menu here; waiting for something certain is simpler than testing for
      it, and a conditional that silently does nothing is how the menu reached a
      take in the first place. A release build takes the `!devBuild` branch and
      skips all three.

      ⚠️ The ✕ is tapped by POINT because it carries no text, and by point
      rather than `back` because `back` reloads the bundle and Maestro's own
      backPress then never returns (observed: hung 90 s).
    */
    setup: devBuild
      ? [
          { extendedWaitUntil: { visible: { text: 'Continue' }, timeout: 180000 } },
          { tapOn: { text: 'Continue' } },
          { extendedWaitUntil: { visible: { text: 'Element inspector' }, timeout: 30000 } },
          { tapOn: { point: '90%,10%' } },
          { extendedWaitUntil: { visible: { text: 'Sign in' }, timeout: 180000 } },
        ]
      : [{ extendedWaitUntil: { visible: { text: 'Sign in' }, timeout: 180000 } }],
    beats: BEATS,
  });
}

