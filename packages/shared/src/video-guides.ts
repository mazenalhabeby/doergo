/**
 * Which video explains which feature.
 *
 * The map from a guided tour to the narrated walkthrough of the same thing,
 * so a screen that already offers "show me around" can also offer "watch it".
 *
 * ⚠️ KEYED ON THE TOUR IDS THAT ALREADY EXIST — see
 * `apps/web-app/src/components/tour/registry.ts`. That was a deliberate choice
 * over inventing a parallel list of "features":
 *
 *   • the tours are already role-gated, so a video inherits the gate and an
 *     employee is never offered the walkthrough of a screen they cannot open;
 *   • they are already translated, so the link's label needs no new strings;
 *   • a tour's steps ARE the script beats — the same sequence, narrated
 *     instead of pointed at. A second list would drift from the first within
 *     a release.
 *
 * ⚠️ `youtubeId` IS NULL FOR EVERY ENTRY and that is the current, correct
 * state: nothing has been uploaded. `videoGuideFor()` returns undefined for an
 * unpublished guide, and any UI reading this MUST hide the link rather than
 * render a dead one — a "watch the video" button that goes nowhere is worse
 * than no button. Publishing is: upload, copy the id out of the URL, paste it
 * here. Nothing else changes.
 *
 * The pipeline that produces the videos is `tools/video/`.
 */

/** Every tour in the web app's registry, as of 2026-09-17. */
export type TourId =
  | 'welcomeAdmin'
  | 'welcomeManager'
  | 'welcomeEmployee'
  | 'tasksTour'
  | 'tasksEmployeeTour'
  | 'membersTour'
  | 'spacesTour'
  | 'attendanceTour'
  | 'reportsTour'
  | 'taskDetailTour'
  | 'pageInvoices'
  | 'pageAssets'
  | 'pageMyTimeoff'
  | 'myAttendanceTour'
  | 'pageInvitations'
  | 'pageOvertime'
  | 'pageJoinRequests'
  | 'pageManage'
  | 'pageSettings'
  | 'pageAvailability'
  | 'memberDetailTour';

/** The languages subtitles are produced in. English is the narrated one. */
export type VideoLanguage = 'en' | 'de' | 'es' | 'fr' | 'it';

export interface VideoGuide {
  /**
   * The YouTube video id — the part after `watch?v=`.
   * Null until the video is published. Never a full URL: the id is what both
   * an embed and a link need, and a stored URL is a stored decision about
   * which of the two the UI uses.
   */
  youtubeId: string | null;
  /** Runtime, for a "2 min" badge next to the link. Null while unpublished. */
  seconds: number | null;
  /** Subtitle tracks uploaded alongside it. */
  languages: VideoLanguage[];
  /**
   * The script under `tools/video/scripts/`, so a video on screen can be
   * traced back to the thing that renders it.
   */
  scriptId: string;
}

const ALL_LANGUAGES: VideoLanguage[] = ['en', 'de', 'es', 'fr', 'it'];

/**
 * Two tours share one video where one video genuinely answers both.
 *
 * Clocking in and reading the team's hours are the two halves of one story,
 * and a member who supervises sees both — so `attendanceTour` and
 * `myAttendanceTour` point at the same file rather than at two videos that
 * would each repeat the other's context.
 */
export const VIDEO_GUIDES: Partial<Record<TourId, VideoGuide>> = {
  myAttendanceTour: {
    youtubeId: null,
    seconds: null,
    languages: ALL_LANGUAGES,
    scriptId: 'clock-in-out',
  },
  attendanceTour: {
    youtubeId: null,
    seconds: null,
    languages: ALL_LANGUAGES,
    scriptId: 'clock-in-out',
  },
};

/**
 * The guide for a tour, or undefined when there is no PUBLISHED video.
 *
 * ⚠️ An entry with a null `youtubeId` is treated as absent on purpose. The
 * alternative — returning the record and asking every caller to check the id —
 * is the shape where one caller forgets and ships a link to
 * `youtube.com/watch?v=null`.
 */
export function videoGuideFor(tourId: string): VideoGuide | undefined {
  const guide = VIDEO_GUIDES[tourId as TourId];
  return guide?.youtubeId ? guide : undefined;
}

export function hasVideoGuide(tourId: string): boolean {
  return videoGuideFor(tourId) !== undefined;
}

/** Watch-page URL. Undefined when unpublished, so a link cannot be built. */
export function videoGuideUrl(tourId: string): string | undefined {
  const guide = videoGuideFor(tourId);
  return guide ? `https://www.youtube.com/watch?v=${guide.youtubeId}` : undefined;
}

/** Privacy-preserving embed host — no cookie until the viewer presses play. */
export function videoGuideEmbedUrl(tourId: string): string | undefined {
  const guide = videoGuideFor(tourId);
  return guide ? `https://www.youtube-nocookie.com/embed/${guide.youtubeId}` : undefined;
}

/** "2:01" for a badge beside the link. */
export function formatVideoLength(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
