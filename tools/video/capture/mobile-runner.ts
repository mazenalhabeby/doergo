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

  const onDevice = '/sdcard/hbcfield-video.mp4';
  await run(ADB, ['-s', device, 'shell', 'rm', '-f', onDevice]).catch(() => {});
  const proc = spawn(
    ADB,
    [
      '-s', device, 'shell', 'screenrecord',
      '--bit-rate', '8000000',
      '--time-limit', String(SCREENRECORD_LIMIT_SEC),
      onDevice,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  return {
    async stop() {
      /*
        ⚠️ SIGINT, not SIGKILL. screenrecord finalises the MP4 container when
        it is interrupted; killed outright it leaves a file with no moov atom,
        which ffprobe reports as a corrupt stream rather than a short one.
      */
      proc.kill('SIGINT');
      await new Promise((r) => proc.on('close', r));
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

    // A logged-out start is the point; watching storage clear is not footage.
    await run(ADB, ['-s', device, 'shell', 'pm', 'clear', APP_ID]);

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
    ⚠️ The recorder starts BEFORE the driver and stops AFTER it. Any other
    order loses the first or last action — and the last action is usually the
    one the whole video was made to show.
  */
  const recorder = await startRecording(phone, device, dir);
  const recorderStart = Date.now();
  // The recorder needs a moment to open its file; starting the driver into one
  // that has not begun writing drops the opening frames.
  await new Promise((r) => setTimeout(r, 1500));

  if (phone === 'android') {
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
  const wantedCut = Math.max(0, firstMark - LEAD_IN_SEC);

  let videoPath = rawMov;
  let cutSec = 0;
  if (wantedCut > 0.25) {
    const trimmed = path.join(dir, 'screen-trimmed.mp4');
    await run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-ss', String(wantedCut),
      '-i', rawMov,
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
    cutSec = rawDuration - (await probeDurationSec(trimmed));
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
