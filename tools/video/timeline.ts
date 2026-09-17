/**
 * The timing manifest: what happened, and when.
 *
 * This is the artefact that removes hand-syncing from the pipeline. The
 * capture run writes it; subtitle generation and audio placement both read it.
 * Because it records what the browser ACTUALLY did rather than what the script
 * hoped it would do, a page that loads half a second slower than last week
 * moves the captions with it instead of putting them out of step.
 */

export interface BeatMark {
  id: string;
  /** Seconds from the first frame of the captured video. */
  startSec: number;
  endSec: number;
  /** How long this beat's narration runs. Never longer than endSec - startSec. */
  narrationSec: number;
}

export interface Timeline {
  /** The raw Playwright recording. */
  videoPath: string;
  durationSec: number;
  /**
   * Footage recorded before the first beat began — Playwright starts the video
   * when the page is created, and the flow does its setup (navigate, wait for
   * the form) before the clock starts so the video opens on a rendered page
   * rather than a white one. Every mark already has this added in; it is kept
   * for diagnosis when something looks a beat out.
   */
  preRollSec: number;
  beats: BeatMark[];
}
