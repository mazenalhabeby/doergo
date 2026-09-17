/**
 * The camera rig for the phone.
 *
 * The web rig drives a browser it owns, so it can hold a beat open in
 * JavaScript and ask the page where a button is. None of that is available
 * here: the app is a native binary in a simulator, the driver is a separate
 * process, and the recorder is a third. So the shape is different on purpose.
 *
 *   WEB     imperative — Node runs the beat, Node holds the clock.
 *   MOBILE  declarative — Node writes ONE flow, Maestro runs it start to
 *           finish, Node reads back when each beat happened.
 *
 * ⚠️ WHY NOT ONE MAESTRO CALL PER BEAT, which would keep the web's shape:
 * Maestro is a JVM program and takes ~6.4 seconds to reach its first command
 * on this machine. Per beat that is six seconds of a frozen phone in the middle
 * of the recording, every time — and the recording cannot be paused. Once per
 * video it is setup, and setup happens before the clock starts.
 *
 * ⚠️ THE PACING TRICK IS UNCHANGED, which is the point. Narration is still
 * measured before capture, and each beat's wait is computed from its own
 * narration length and baked into the flow. Change a sentence and the next run
 * re-paces itself, exactly as on the web.
 *
 * ⚠️ MARKS ARE OBSERVED, NEVER COMPUTED. It is tempting to add the waits up and
 * call that the timeline, but a tap that takes 300ms longer than last run would
 * then move every later caption out of step. Each beat is fenced by a labelled
 * no-op, and Node timestamps the line when Maestro announces it — so the marks
 * describe what the phone actually did.
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OUT_DIR } from '../config.ts';
import type { BeatMark, Timeline } from '../timeline.ts';
import { probeDurationSec } from '../assemble/ffmpeg.ts';

const run = promisify(execFile);

/**
 * Maestro needs a JDK and the installer does not provide one, so a machine that
 * has never run this finds `java` missing at the least useful moment — after
 * narration has been synthesised and paid for. Resolved here, checked early.
 */
const JAVA_HOME =
  process.env.VIDEO_JAVA_HOME ?? '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home';

const MAESTRO_BIN = process.env.VIDEO_MAESTRO_BIN ?? `${process.env.HOME}/.maestro/bin/maestro`;

/** The app under the camera. The same id on both platforms. */
export const APP_ID = process.env.VIDEO_APP_ID ?? 'com.hbcfield.app';

/**
 * A Maestro command, as it appears in the flow file.
 *
 * Deliberately `unknown`-valued rather than a hand-written union of every
 * command Maestro supports: that union would be a second copy of their
 * documentation, and it would be wrong the first time they add a command.
 */
export type MaestroStep = Record<string, unknown> | string;

export interface MobileBeat {
  id: string;
  /** What the phone does while this beat's narration plays. */
  steps: MaestroStep[];
}

/**
 * Which phone is being filmed.
 *
 * ⚠️ ANDROID IS THE DEFAULT, AND THAT IS NOT A PREFERENCE. The iOS simulator
 * cannot run this app on an Apple Silicon Mac at all: Google's MLKit — the
 * on-device reader behind the business-card and document scanners — ships no
 * arm64 SIMULATOR slice, only arm64 for real devices and x86_64 for the old
 * Intel simulators. That is why the Podfile carries
 * `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64`, which was the correct fix on
 * an Intel Mac and is unfixable here, because iOS 26 simulators are arm64-only.
 * The linker says it plainly:
 *
 *   ld: building for 'iOS-simulator', but linking in object file
 *       (MLImage.framework/MLImage[arm64]) built for 'iOS'
 *
 * So iOS footage needs a REAL iPhone (Maestro drives one over USB) or a build
 * with the OCR module stripped. Android has no such gap and films today.
 */
export type Phone = 'android' | 'ios';

export interface MobileStageOptions {
  /** Beat id -> how many seconds its narration runs. */
  narrationDurations: Record<string, number>;
  /** Names the output directory under renders/. */
  videoId: string;
  /** Which kind of device. See the note on `Phone`. */
  phone?: Phone;
  /** Which device to film. Defaults to whichever one is running. */
  udid?: string;
  /**
   * Open the app at this URL instead of simply launching it.
   *
   * ⚠️ REQUIRED FOR A DEBUG BUILD, which is what this films. The app bundles
   * `expo-dev-client`, so launching it normally opens the DEV LAUNCHER — a
   * list of development servers — and not the product. With `clearState` the
   * launcher has no remembered server either, so it waits for a human. Opening
   * `hbcfield://expo-development-client/?url=<metro>` goes straight past it
   * into the app, which is the only thing the video is about.
   */
  launchUrl?: string;
  /**
   * Wipe the app's storage before launching, forcing a logged-out start.
   *
   * ⚠️ DEFAULTS TO TRUE, but a flow that does not FILM signing in should turn it
   * off. Clearing means the flow must type an email and a password, and an
   * emulator renders that one character at a time — about a hundred seconds of
   * setup, spent every run, to reach a screen the video does not show.
   */
  clearState?: boolean;
  /**
   * Text that proves the app has finished loading, polled BEFORE the recorder
   * starts.
   *
   * ⚠️ WITHOUT THIS THE FLOW RACES ITS OWN LAUNCH. Maestro reads whatever view
   * hierarchy the device is showing, and a relaunch does not clear it — so the
   * setup's "wait until Attendance is visible" matched the PREVIOUS instance's
   * screen and returned in a second, while the app behind it was still on its
   * splash. Every beat then played over a loading screen and the take was 45
   * seconds of nothing, with no step reported as failed.
   *
   * Polled over adb rather than through Maestro: it costs no JVM start, and it
   * happens before the camera is rolling, so it can take as long as it needs.
   */
  readyText?: string;
  /** Steps run BEFORE the clock starts — sign-in, navigation, anything dull. */
  setup?: MaestroStep[];
  beats: MobileBeat[];
}

/**
 * The fence posts.
 *
 * A marker must do nothing to the app — one that tapped something would be part
 * of the video — and it must print a line Node can recognise. That rules out
 * `evalScript`, which is the obvious no-op but takes no `label` (Maestro
 * rejects the flow outright: "Invalid Command Format"). A wait for something
 * that will never appear, with a 1 ms timeout, is a no-op that does carry one.
 *
 * ⚠️ Maestro prints the label when the command COMPLETES, not when it starts.
 * That is exactly why the timeout is 1 ms and not the hold itself: a marker
 * that also waited would be timestamped at the END of its own wait, putting
 * every beat's start one hold too late.
 */
const mark = (kind: 'BEGIN' | 'END', id: string): MaestroStep => ({
  extendedWaitUntil: { notVisible: '__never__', timeout: 1, label: `__${kind}__${id}__` },
});

/** A beat is held until its narration has finished, plus a short tail. */
const TAIL_SEC = 0.45;

/**
 * Hold the screen for a fixed time.
 *
 * ⚠️ MAESTRO HAS NO SLEEP, and the obvious substitutes do not work. A
 * `extendedWaitUntil: notVisible:` on something that does not exist returns
 * IMMEDIATELY — the condition is already true — so a 5-second timeout measured
 * 1.5 seconds; and `waitForAnimationToEnd` returns as soon as the screen stops
 * moving, which on a settled screen is at once. Either one would have let the
 * picture race ahead of the voice while looking, in the flow file, exactly like
 * a wait.
 *
 * So the wait happens in Maestro's own JavaScript, on the HOST. It costs a core
 * for the duration, which is why it is a plain loop and not something cleverer:
 * nothing else is running on this machine during a take, and it is the phone's
 * clock that must not be disturbed.
 *
 * Measured: a 4,000 ms hold takes 4.87 s wall-clock, and two bare commands
 * cost 0.56 s between them — so the fixed overhead below is a subtraction, not
 * a guess. Overshooting is harmless anyway (a little dead air); undershooting
 * is not (the next beat's picture arrives under this beat's sentence).
 */
const COMMAND_OVERHEAD_SEC = 0.35;

export const holdFor = (seconds: number): MaestroStep => ({
  evalScript:
    '${ (function(){ var s = Date.now(); while (Date.now() - s < ' +
    Math.round(seconds * 1000) +
    ') {} return 1; })() }',
});

function buildFlow(options: MobileStageOptions): string {
  /*
    ⚠️ ON ANDROID THE APP IS ALREADY OPEN by the time this flow runs — Node
    cleared it and started it by explicit component before handing over. It is
    not done here because `openLink` fires an ambiguous VIEW intent, and any
    second app claiming the same scheme turns that into an "Open with" chooser.
    One did: a `eu.hbcgroup.hbcfield` build left on the emulator also answers
    `hbcfield://`, and the take died on a system dialog with two identical rows.
  */
  const lines: string[] = [`appId: ${APP_ID}`, '---'];
  if (!options.launchUrl) {
    lines.push('- launchApp:', `    appId: ${APP_ID}`, '    clearState: true');
  }

  const emit = (steps: MaestroStep[], indent = '') => {
    for (const step of steps) {
      if (typeof step === 'string') {
        lines.push(`${indent}- ${step}`);
        continue;
      }
      lines.push(`${indent}- ${JSON.stringify(step)}`);
    }
  };

  emit(options.setup ?? []);

  for (const beat of options.beats) {
    const narrationSec = options.narrationDurations[beat.id] ?? 0;
    lines.push(`# ── ${beat.id} ─────────────────────────────`);
    emit([mark('BEGIN', beat.id)]);
    emit(beat.steps);
    /*
      ⚠️ The wait is the WHOLE narration, not the remainder after the taps.
      Maestro gives no way to ask "how long have you been in this beat", so
      subtracting would need a predicted tap cost — and a prediction that is
      wrong leaves the voice talking over the next beat's picture. Waiting the
      full length costs a little dead air at the end of a beat and can never
      desynchronise. A tighter version is possible once the marks from a first
      run are known.
    */
    emit([{ waitForAnimationToEnd: { timeout: 1200 } }]);
    const hold = narrationSec + TAIL_SEC - COMMAND_OVERHEAD_SEC;
    if (hold > 0) emit([holdFor(hold)]);
    emit([mark('END', beat.id)]);
  }

  return lines.join('\n') + '\n';
}

const ADB = process.env.VIDEO_ADB ?? `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;

/**
 * ⚠️ BY EXPLICIT COMPONENT (`-n package/.MainActivity`). Naming the activity
 * leaves Android nothing to disambiguate, so no "Open with" chooser can appear
 * however many other apps claim the scheme — and one did: a leftover
 * `eu.hbcgroup.hbcfield` build also answers `hbcfield://`, and a take died on a
 * system dialog offering two identical rows.
 */
async function launchAndroid(device: string, url?: string): Promise<void> {
  await run(ADB, [
    '-s', device, 'shell', 'am', 'start',
    '-n', `${APP_ID}/.MainActivity`,
    // A release build needs no URL: it carries its own JS and has no dev client
    // to point at a Metro server.
    ...(url ? ['-a', 'android.intent.action.VIEW', '-d', url] : []),
  ]);
}

/** Whichever device is running, so the operator's choice is the one filmed. */
async function runningDevice(phone: Phone): Promise<string> {
  if (phone === 'ios') {
    const { stdout } = await run('xcrun', ['simctl', 'list', 'devices', 'booted', '-j']);
    const parsed = JSON.parse(stdout) as {
      devices: Record<string, Array<{ udid: string; state: string }>>;
    };
    for (const list of Object.values(parsed.devices)) {
      for (const device of list) if (device.state === 'Booted') return device.udid;
    }
    throw new Error(
      'No booted iOS simulator. Start one first:\n  xcrun simctl boot "iPhone 17 Pro" && open -a Simulator',
    );
  }

  const { stdout } = await run(ADB, ['devices']);
  const serial = stdout
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .find((parts) => parts[1] === 'device')?.[0];
  if (!serial) {
    throw new Error(
      'No Android device or emulator is running. Start one first:\n' +
        '  ~/Library/Android/sdk/emulator/emulator -avd Pixel_10_Pro',
    );
  }
  return serial;
}

/**
 * The recorder.
 *
 * ⚠️ The two platforms differ in a way that matters to the caller: simctl
 * writes to the Mac as it records and stops cleanly on SIGINT, while
 * `adb screenrecord` writes to the DEVICE and the file is only usable once the
 * process has exited and the file has been pulled. So Android's stop is two
 * steps, and `stop()` hides that rather than leaving it to every flow.
 *
 * ⚠️ `screenrecord` caps at 180 seconds and stops silently at the limit. Every
 * video in the plan is under two minutes, so the cap is not currently a
 * constraint — but a longer one would end mid-sentence with no error, which is
 * why this says so out loud.
 */
interface Recorder {
  stop(): Promise<string>;
}

const SCREENRECORD_LIMIT_SEC = 180;

async function startRecording(
  phone: Phone,
  device: string,
  dir: string,
): Promise<Recorder> {
  const out = path.join(dir, 'screen.mp4');

  if (phone === 'ios') {
    const proc = spawn(
      'xcrun',
      ['simctl', 'io', device, 'recordVideo', '--codec', 'h264', '--force', out],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    return {
      async stop() {
        proc.kill('SIGINT');
        await new Promise((r) => proc.on('close', r));
        return out;
      },
    };
  }

  /*
    ⚠️ ON AN EMULATOR, RECORD ON THE HOST — NOT IN THE GUEST.

    `adb shell screenrecord` encodes inside the guest, on the same starved
    cores that are already failing to draw the app. Under load it does not slow
    down, it FREEZES: takes came back holding one identical frame for forty-five
    seconds while logcat showed the app navigating normally the whole time, and
    nothing anywhere reported an error. It also stamps frames with the guest
    clock, so the file's duration bore no relation to how long the take took.

    The emulator has its own recorder (`adb emu screenrecord`) which encodes in
    QEMU on the Mac and writes straight here. Same load, same machine: every
    frame different, and a duration that matches wall time to a tenth of a
    second. It is only available on an emulator, so a real device keeps the
    path above.
  */
  if (/^emulator-/.test(device)) {
    const hostOut = path.join(dir, 'screen.webm');
    await fs.rm(hostOut, { force: true });
    await run(ADB, [
      '-s', device, 'emu', 'screenrecord', 'start',
      '--time-limit', String(SCREENRECORD_LIMIT_SEC),
      hostOut,
    ]);
    return {
      async stop() {
        await run(ADB, ['-s', device, 'emu', 'screenrecord', 'stop']).catch(() => {});
        // QEMU finalises the container after it answers; the file is short or
        // unreadable if it is opened straight away.
        await new Promise((r) => setTimeout(r, 2500));
        return hostOut;
      },
    };
  }

  const onDevice = '/sdcard/hbcfield-video.mp4';
  await run(ADB, ['-s', device, 'shell', 'rm', '-f', onDevice]).catch(() => {});
  /*
    ⚠️ `detached: true` PUTS THE RECORDER IN ITS OWN PROCESS GROUP, and that is
    not tidiness — it is the fix for the failure that cost most of a day. Spawned
    normally, the child shares this process's group, and the SIGINT sent to stop
    it reached NODE as well: the render died the instant it tried to stop
    recording, printing nothing and exiting 0, while Maestro carried on
    orphaned. Every "silent exit at 3/4 capture" was this.
  */
  const proc = spawn(
    ADB,
    [
      '-s', device, 'shell', 'screenrecord',
      /*
        ⚠️ RECORD SMALLER THAN THE PANEL. An emulator's screenrecord encodes on
        the same cores that are already struggling to draw the app, and at the
        full 1280×2856 it silently gives up on frames: takes came back holding
        one stale dashboard for two minutes while logcat showed the app
        navigating normally throughout. 720×1600 is more than the assembly
        needs — the phone is composited into a 1080p frame at roughly half
        width — and it is the difference between a recording and a slideshow.
      */
      '--size', '720x1600',
      '--bit-rate', '6000000',
      '--time-limit', String(SCREENRECORD_LIMIT_SEC),
      onDevice,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
  );

  return {
    async stop() {
      /*
        ⚠️ STOPPED ON THE DEVICE, NOT BY SIGNALLING THE LOCAL PROCESS. Sending
        SIGINT to the `adb` child killed THIS process too — the render died the
        moment it tried to stop recording, printing nothing and exiting 0 while
        Maestro carried on orphaned. Every "silent exit at 3/4 capture" was
        that. `detached: true` was not enough on its own.

        ⚠️ -INT rather than -KILL: screenrecord finalises the MP4 container when
        interrupted; killed outright it leaves a file with no moov atom, which
        ffprobe reports as a corrupt stream rather than a short one.
      */
      await run(ADB, ['-s', device, 'shell', 'pkill', '-INT', 'screenrecord']).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
      proc.unref();
      // The device needs a moment to flush and close the file.
      await new Promise((r) => setTimeout(r, 1500));
      await run(ADB, ['-s', device, 'pull', onDevice, out]);
      await run(ADB, ['-s', device, 'shell', 'rm', '-f', onDevice]).catch(() => {});
      return out;
    },
  };
}

export async function captureMobile(options: MobileStageOptions): Promise<Timeline> {
  const phone: Phone = options.phone ?? 'android';
  const device = options.udid ?? (await runningDevice(phone));

  try {
    await fs.access(path.join(JAVA_HOME, 'bin', 'java'));
  } catch {
    throw new Error(
      `Maestro needs a JDK and none was found at ${JAVA_HOME}.\n` +
        '  brew install openjdk\n' +
        'or point VIDEO_JAVA_HOME at one.',
    );
  }

  const dir = path.join(OUT_DIR, options.videoId, 'capture');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  const flowFile = path.join(dir, 'flow.yaml');
  await fs.writeFile(flowFile, buildFlow(options), 'utf8');

  /*
    THE WARM-UP LAUNCH. Wipe, open once, throw that launch away.

    ⚠️ IT SOLVES TWO PROBLEMS AT ONCE, and neither is obvious.

    First, `expo-dev-client` opens its DEVELOPER MENU automatically the first
    time a freshly-installed app is launched — and clearing storage for a
    logged-out start is what makes every take look freshly installed. Dismissing
    it from inside the recorded flow was tried and is worse than it sounds:
    tapping its "Continue" only closes the onboarding sheet and reveals the menu
    proper, and a `back` to close THAT reloads the bundle, after which Maestro's
    own backPress never returns — it waits for a view hierarchy that a reloading
    app never stops changing. Observed: hung for 90 seconds, then killed.

    Second, a debug build fetches its whole JS bundle from Metro on a cold
    start. Spending that here means the take opens on a drawn screen.

    So the menu is consumed and the bundle cached while nothing is recording,
    and the app is then stopped. The state stays cleared — `pm clear` ran once,
    and simply closing an app does not sign anybody back in.
  */
  if (phone === 'android') {
    /*
      ⚠️ GIVE THE EMULATOR A REAL KEYBOARD. An emulator inherits the Mac's
      keyboard as a HARDWARE keyboard, and Android then suppresses the on-screen
      one — leaving a small floating toolbar (microphone, backspace, emoji)
      hovering over the form, which both looks broken on camera and swallowed
      the typing: the email field stayed empty while the flow reported the tap
      as fine. Asking for the soft keyboard anyway fixes both, and a video of
      somebody typing should show a keyboard.
    */
    await run(ADB, [
      '-s', device, 'shell', 'settings', 'put', 'secure',
      'show_ime_with_hard_keyboard', '1',
    ]).catch(() => {});

    /*
      ⚠️ TUNNEL THE HOST'S PORTS INTO THE DEVICE, rather than pointing the app
      at the Mac's LAN address.

      The LAN route works until it doesn't, and its failures are silent: this
      machine's address changed mid-session (192.168.178.60 → 192.168.0.143) and
      the app simply sat on the login screen, no error, no log — a request to an
      address that no longer existed. Emulator NAT is also unreliable after a
      wipe; ping to the host was dropping half its packets.

      `adb reverse` makes the DEVICE's own localhost mean this Mac, so the app
      dials `localhost:4000` and lands on the gateway whatever the Wi-Fi is
      doing. Nothing to resolve, nothing to go stale.

      ⚠️ Best-effort: a real device over USB supports this too, but a device that
      refuses it should not fail the whole render — the flow will say so more
      clearly when it cannot sign in.
    */
    for (const port of ['4000', '8081']) {
      await run(ADB, ['-s', device, 'reverse', `tcp:${port}`, `tcp:${port}`]).catch(() => {});
    }

    /*
      ⚠️ GRANT LOCATION BEFORE FILMING, NEVER DURING.

      The clock asks the OS for a fix the moment Clock In is tapped, and on a
      fresh install Android answers with its own permission dialog — three
      buttons over the app, drawn by the system, which Maestro then has to
      answer mid-take. Every clock flow failed on exactly this: the tap was
      reported COMPLETED, "Clock Out" never appeared, and the screenshot showed
      the OS asking about Precise vs Approximate.

      Granting it here costs nothing on camera and removes a whole class of
      flake. Best-effort: a build without the permission in its manifest simply
      makes this a no-op.
    */
    const LOCATION_PERMS = [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      /*
        ⚠️ AND THE BACKGROUND ONE, which is a THIRD sheet — the app's own,
        raised the moment a shift starts, because it keeps recording the route
        while the phone is in a pocket. Granted last, after the foreground
        pair: Android refuses it on its own.
      */
      'android.permission.ACCESS_BACKGROUND_LOCATION',
    ];

    // A logged-out start, only when the flow actually needs one.
    if (options.clearState !== false) {
      await run(ADB, ['-s', device, 'shell', 'pm', 'clear', APP_ID]);
    }

    // After `pm clear`, which revokes them again.
    for (const perm of LOCATION_PERMS) {
      await run(ADB, ['-s', device, 'shell', 'pm', 'grant', APP_ID, perm]).catch(() => {});
    }

    /*
      ⚠️ AND STOP THE APP AFTERWARDS. Android kills a process whose permissions
      change, and a development build that dies that way comes back showing its
      crash-report launcher instead of the app — which is what happened the
      first time this ran against an app left open from the previous take. A
      deliberate stop makes the next launch a cold one either way.
    */
    await run(ADB, ['-s', device, 'shell', 'am', 'force-stop', APP_ID]).catch(() => {});

    /*
      ⚠️ AND TURN THE HANDSET'S OWN LOCATION ON, which is a SECOND dialog.

      Granting the app the permission is not the same as the device having
      location switched on. With it off, the first fix request raises Google's
      "Location Accuracy" consent sheet — a system dialog with its own wording
      and its own two buttons — which covered the clock exactly the way the
      permission dialog had, one take later. `location_mode 3` is high accuracy,
      which is both the fix and the reason that sheet is never asked for.
    */
    await run(ADB, [
      '-s', device, 'shell', 'settings', 'put', 'secure', 'location_mode', '3',
    ]).catch(() => {});

    /*
      A DEVELOPMENT BUILD ONLY: open it once and throw that launch away, to
      cache the JS bundle and get the developer menu out of the way.

      ⚠️ THIS IS WHY A RELEASE BUILD IS THE DEFAULT. `expo-dev-client` opens its
      developer menu whenever the app looks freshly installed — which clearing
      storage makes it, every take. Three ways of dismissing it were tried and
      all failed: `back` inside the flow reloads the bundle and Maestro's
      backPress then never returns (hung 90 s); tapping "Continue" closes only
      the onboarding sheet and reveals the menu behind it; doing both during a
      warm-up did not stop the menu arriving again on the next launch, on top of
      the login form, mid-take. A release build has no dev client at all, bundles
      its own JS, and is what a customer actually sees — so it is both the
      reliable answer and the honest one for a product video.
    */
    /*
      ⚠️ NO WARM-UP LAUNCH. One was tried and removed: it opened the app, waited
      a fixed 40 s, tapped where the developer menu's buttons ought to be, and
      stopped the app again. The fixed wait is the flaw — when the bundle took
      longer than that, the taps landed on nothing and the menu turned up again
      mid-take. The flow's own `setup` waits for the menu to be VISIBLE before
      touching it, which cannot be early, and costs nothing when it never
      appears.
    */
  }

  /*
    ⚠️ WAIT FOR THE APP ITSELF, not for the screen to look right.

    A cold start on a debug build is the JS bundle coming down from Metro, and
    on this emulator that is half a minute. It has to happen before the camera
    rolls — see `readyText` for what filming it instead looks like.
  */
  if (phone === 'android' && options.readyText) {
    await launchAndroid(device, options.launchUrl);

    const deadline = Date.now() + 180_000;
    let ready = false;
    while (Date.now() < deadline) {
      const { stdout } = await run(ADB, [
        '-s', device, 'shell',
        `uiautomator dump /sdcard/__ready.xml >/dev/null 2>&1; grep -c '${options.readyText}' /sdcard/__ready.xml`,
      ]).catch(() => ({ stdout: '0' }));
      if (Number(stdout.trim()) > 0) { ready = true; break; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!ready) {
      throw new Error(
        `The app never showed "${options.readyText}" — it is still loading, or it is not signed in.`,
      );
    }
    // Let the first render settle so the opening frames are not mid-animation.
    await new Promise((r) => setTimeout(r, 1500));
  }

  /*
    ⚠️ The recorder starts BEFORE the driver and stops AFTER it. Any other
    order loses the first or last action — and the last action is usually the
    one the whole video was made to show.
  */
  const recorder = await startRecording(phone, device, dir);
  const recorderStart = Date.now();
  // The recorder needs a moment to open its file; starting the driver into one
  // that has not begun writing drops the opening frames.
  await new Promise((r) => setTimeout(r, 1500));

  /*
    ⚠️ ONLY IF IT IS NOT ALREADY OPEN. With `readyText` the app was launched and
    waited for before the camera rolled; launching it again here restarts it,
    and on a debug build that means fetching the bundle from Metro a second
    time — ON CAMERA. That one redundant launch took a take from ~40 seconds to
    252, which is past what `adb screenrecord` will record at all (a hard 180 s
    cap, reached silently), so the footage ended before the clock-in it was
    made to show.
  */
  if (phone === 'android' && !options.readyText) {
    await launchAndroid(device, options.launchUrl);
  }

  const marks = new Map<string, { begin?: number; end?: number }>();
  let firstMark = 0;

  const maestro = spawn(MAESTRO_BIN, ['test', '--no-ansi', '--udid', device, flowFile], {
    env: {
      ...process.env,
      JAVA_HOME,
      PATH: `${JAVA_HOME}/bin:${process.env.PATH ?? ''}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  const readMarks = (chunk: string) => {
    log += chunk;
    for (const line of chunk.split('\n')) {
      const m = /__(BEGIN|END)__(.+?)__/.exec(line);
      if (!m) continue;
      /*
        ⚠️ Timestamped when the LINE ARRIVES, not when the flow says it ran.
        Maestro prints a command as it starts it, and that print is the only
        moment Node and the phone are known to agree on.
      */
      const at = (Date.now() - recorderStart) / 1000;
      if (!firstMark) firstMark = at;
      const entry = marks.get(m[2]!) ?? {};
      if (m[1] === 'BEGIN') entry.begin ??= at;
      else entry.end = at;
      marks.set(m[2]!, entry);
    }
  };

  maestro.stdout.setEncoding('utf8');
  maestro.stderr.setEncoding('utf8');
  maestro.stdout.on('data', readMarks);
  maestro.stderr.on('data', readMarks);

  const code: number = await new Promise((resolve) => maestro.on('close', resolve));

  // Let the last frame land before the recorder is asked to stop.
  await new Promise((r) => setTimeout(r, 900));
  const wallSec = (Date.now() - recorderStart) / 1000;
  const rawMov = await recorder.stop();

  if (code !== 0) {
    await fs.writeFile(path.join(dir, 'maestro.log'), log, 'utf8');
    throw new Error(
      `Maestro exited ${code}. The flow and its full output are in\n  ${path.relative(process.cwd(), dir)}\n` +
        'The last lines were:\n' +
        log.split('\n').filter(Boolean).slice(-12).join('\n'),
    );
  }

  /*
    ⚠️ CUT THE APPROACH OFF THE FRONT.

    A Debug build fetches its JS bundle from Metro on launch, and a cold Metro
    spends the best part of a minute on it. That is a minute of splash screen —
    and unlike the web rig's two seconds of a drawn login page, it is not
    footage anybody should see. It cannot be avoided by starting the recorder
    later either: the recorder has to be running before the driver, or the
    first taps are lost.

    So it is filmed and then removed. A short lead-in is kept so the video opens
    on a settled screen rather than mid-gesture.
  */
  const LEAD_IN_SEC = 1.2;
  const rawDuration = await probeDurationSec(rawMov);

  /*
    ⚠️ SAY SO WHEN THE RECORDER RAN OUT. `adb screenrecord` stops at 180 seconds
    and says nothing — the file is valid, simply short, and the take looks like
    a flow that quietly failed near the end. Better to name it.
  */
  if (rawDuration > 178 && wallSec > rawDuration + 2) {
    throw new Error(
      `The recording hit adb's 180-second limit while the flow ran for ${wallSec.toFixed(0)}s — ` +
        'the end of the take was never filmed. Shorten the flow, or split the video.',
    );
  }

  /*
    ⚠️ THE RECORDING'S CLOCK IS NOT THIS MACHINE'S CLOCK.

    `screenrecord` stamps each frame with the GUEST's clock, and a busy
    emulator runs its guest slower than real time: a 55.7-second take came back
    as a 134.7-second file. Marks are taken here, in wall time, so every one of
    them landed in roughly the first fifth of that file — which is why three
    beats of narration played over one unchanging dashboard while Maestro
    reported every tap as COMPLETED, and why nothing looked broken anywhere.

    The footage is re-timed to real seconds rather than the marks being scaled
    to match it. Both put the captions in the right place; only this one also
    plays the phone at the speed a person would have seen, instead of two and a
    half times slower than the voice describing it.

    Measured per take, because it depends on how loaded the machine was, and
    skipped entirely when it is within 5% — a real device does not drift.
  */
  let footage = rawMov;
  let footageDuration = rawDuration;
  const drift = wallSec > 1 ? rawDuration / wallSec : 1;

  if (Math.abs(drift - 1) > 0.05) {
    const retimed = path.join(dir, 'screen-retimed.mp4');
    await run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', rawMov,
      '-filter:v', `setpts=PTS/${drift}`,
      '-an',
      retimed,
    ]);
    footage = retimed;
    footageDuration = await probeDurationSec(retimed);
  }

  const wantedCut = Math.max(0, firstMark - LEAD_IN_SEC);

  let videoPath = footage;
  let cutSec = 0;
  if (wantedCut > 0.25) {
    const trimmed = path.join(dir, 'screen-trimmed.mp4');
    await run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-ss', String(wantedCut),
      '-i', footage,
      // Stream copy: the footage is re-encoded by assembly anyway, and doing it
      // twice costs a minute and a generation of quality for nothing.
      '-c', 'copy',
      trimmed,
    ]);
    /*
      ⚠️ How much came off is MEASURED, not assumed. A stream copy can only cut
      at a keyframe, so ffmpeg silently keeps up to a group-of-pictures more
      than it was asked for. Trusting `wantedCut` here would shift every caption
      by that difference — comparing the durations gives the real figure.
    */
    cutSec = footageDuration - (await probeDurationSec(trimmed));
    videoPath = trimmed;
  }

  const durationSec = await probeDurationSec(videoPath);

  const beats: BeatMark[] = options.beats.map((b) => {
    const m = marks.get(b.id);
    if (!m?.begin || !m.end) {
      throw new Error(
        `Beat "${b.id}" left no marks in Maestro's output — the flow probably failed before it.`,
      );
    }
    return {
      id: b.id,
      startSec: m.begin - cutSec,
      endSec: m.end - cutSec,
      narrationSec: options.narrationDurations[b.id] ?? 0,
    };
  });

  return {
    videoPath,
    durationSec,
    // What is left of the approach after the cut — the lead-in, near enough.
    preRollSec: Math.max(0, firstMark - cutSec),
    beats,
  };
}
