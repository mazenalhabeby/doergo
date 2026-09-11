import type { Ionicons } from '@expo/vector-icons';

/**
 * WHY this screen wants the camera — as data, not as code.
 *
 * Every camera surface in the app asks for the same OS permission and differs
 * only in what it is for and what it promises. That difference was copied into
 * each screen, so the business-card wording ended up on the receipt screen
 * telling somebody their fuel slip would never be uploaded. It uploads.
 *
 * ⚠️ THE PROMISES ARE CLAIMS, NOT DECORATION. They are shown at the exact
 * moment a person decides whether to trust this app with a camera, so each one
 * has to be TRUE of the flow that shows it. That is why there is no single
 * generic screen: a flow that uploads cannot borrow the wording of one that
 * deletes, and a screen with nothing specific to say teaches people that the
 * words are noise.
 *
 * `uploads` exists so the honesty is machine-checked rather than reviewed:
 * `purposes.spec.ts` fails if a purpose that sends the image anywhere also
 * promises the image stays on the phone.
 *
 * Adding a surface is adding a row here. No screen changes, no hook changes.
 */

export type IoniconName = keyof typeof Ionicons.glyphMap;

/** Which OS permission a flow needs. Some need both. */
export type MediaKind = 'camera' | 'library';

/** One translatable line: the key, and the English it falls back to. */
export interface Line {
  k: string;
  d: string;
}

export interface Promise_ extends Line {
  icon: IoniconName;
}

/**
 * The reusable claims.
 *
 * Atoms rather than free text per purpose: the same guarantee must read
 * identically wherever it is made, or the reader learns that the wording is
 * approximate. Each is translated once.
 */
export const PROMISE = {
  readHere: {
    icon: 'phone-portrait-outline',
    k: 'perm.p.readHere',
    d: 'Read on this phone — the image never leaves it',
  },
  textStaysHere: {
    icon: 'phone-portrait-outline',
    k: 'perm.p.textStaysHere',
    d: 'Read on this phone — the text never leaves it',
  },
  deletedAfterReading: {
    icon: 'trash-outline',
    k: 'perm.p.deletedAfterReading',
    d: 'The photo is deleted the moment it has been read',
  },
  youCheckFirst: {
    icon: 'checkmark-circle-outline',
    k: 'perm.p.youCheckFirst',
    d: 'You check every field before anything is saved',
  },
  sentWithIt: {
    icon: 'cloud-upload-outline',
    k: 'perm.p.sentWithIt',
    d: 'The photo is sent with it, so the office can check it',
  },
  nothingCreatedYet: {
    icon: 'lock-closed-outline',
    k: 'perm.p.nothingCreatedYet',
    d: 'Nothing is created until somebody confirms it',
  },
  yourFileOnly: {
    icon: 'shield-checkmark-outline',
    k: 'perm.p.yourFileOnly',
    d: 'It goes into your own personnel file, nobody else’s',
  },
  onTheJob: {
    icon: 'briefcase-outline',
    k: 'perm.p.onTheJob',
    d: 'It is attached to this job, where your team can see it',
  },
  youCanRemove: {
    icon: 'close-circle-outline',
    k: 'perm.p.youCanRemove',
    d: 'You can remove it afterwards',
  },
} as const satisfies Record<string, Promise_>;

export interface Purpose {
  /** Which permissions the flow actually needs. */
  needs: readonly MediaKind[];
  /**
   * Does the image leave the device?
   *
   * ⚠️ Load-bearing. The spec refuses a purpose that uploads AND claims the
   * image stays on the phone — the one lie this screen could tell that would
   * matter.
   */
  uploads: boolean;
  title: Line;
  subtitle: Line;
  promises: readonly Promise_[];
  /** The way out. Never a dead end — every flow has a by-hand alternative. */
  cancel: Line;
}

export const PURPOSES = {
  'business-card': {
    needs: ['camera'],
    uploads: false,
    title: { k: 'perm.card.title', d: 'Scan a business card' },
    subtitle: { k: 'perm.card.sub', d: 'Point the camera at a card and the client details fill themselves in.' },
    promises: [PROMISE.readHere, PROMISE.deletedAfterReading, PROMISE.youCheckFirst],
    cancel: { k: 'perm.card.cancel', d: 'Enter the details by hand' },
  },
  receipt: {
    needs: ['camera'],
    uploads: true,
    title: { k: 'perm.receipt.title', d: 'Photograph the receipt' },
    subtitle: { k: 'perm.receipt.sub', d: 'Point the camera at the slip and the amount, the date and the shop fill themselves in.' },
    // NOT `readHere` — the slip is uploaded as evidence for whoever approves it.
    promises: [PROMISE.youCheckFirst, PROMISE.sentWithIt, PROMISE.youCanRemove],
    cancel: { k: 'perm.receipt.cancel', d: 'Type it instead' },
  },
  document: {
    needs: ['camera'],
    uploads: true,
    title: { k: 'perm.doc.title', d: 'Photograph the document' },
    subtitle: { k: 'perm.doc.sub', d: 'Point the camera at the page and it works out what it is.' },
    promises: [PROMISE.textStaysHere, PROMISE.sentWithIt, PROMISE.nothingCreatedYet],
    cancel: { k: 'perm.doc.cancel', d: 'Type it instead' },
  },
  contract: {
    needs: ['camera'],
    uploads: false,
    title: { k: 'perm.contract.title', d: 'Photograph the contract' },
    subtitle: { k: 'perm.contract.sub', d: 'Point the camera at the agreement and the plate, the make and the dates fill themselves in.' },
    promises: [PROMISE.textStaysHere, PROMISE.deletedAfterReading, PROMISE.nothingCreatedYet],
    cancel: { k: 'perm.contract.cancel', d: 'Type it instead' },
  },
  'id-document': {
    needs: ['camera'],
    uploads: true,
    title: { k: 'perm.id.title', d: 'Photograph the document' },
    subtitle: { k: 'perm.id.sub', d: 'Your licence, passport or certificate — the dates are read for you.' },
    promises: [PROMISE.yourFileOnly, PROMISE.youCheckFirst, PROMISE.sentWithIt],
    cancel: { k: 'perm.id.cancel', d: 'Choose a file instead' },
  },
  'task-photo': {
    needs: ['camera', 'library'],
    uploads: true,
    title: { k: 'perm.task.title', d: 'Add a photo to the job' },
    subtitle: { k: 'perm.task.sub', d: 'Show what you found, or what you fixed.' },
    promises: [PROMISE.onTheJob, PROMISE.youCanRemove],
    cancel: { k: 'common.cancel', d: 'Not now' },
  },
  'issue-photo': {
    needs: ['camera', 'library'],
    uploads: true,
    title: { k: 'perm.issue.title', d: 'Show the problem' },
    subtitle: { k: 'perm.issue.sub', d: 'A photo reaches whoever can act on it faster than a description.' },
    promises: [PROMISE.sentWithIt, PROMISE.youCanRemove],
    cancel: { k: 'common.cancel', d: 'Not now' },
  },
  'worklog-photo': {
    needs: ['camera', 'library'],
    uploads: true,
    title: { k: 'perm.worklog.title', d: 'Add a photo to your day' },
    subtitle: { k: 'perm.worklog.sub', d: 'A note with a picture is worth more at the end of the month.' },
    promises: [PROMISE.sentWithIt, PROMISE.youCanRemove],
    cancel: { k: 'common.cancel', d: 'Not now' },
  },
  avatar: {
    needs: ['camera', 'library'],
    uploads: true,
    title: { k: 'perm.avatar.title', d: 'Choose a profile picture' },
    subtitle: { k: 'perm.avatar.sub', d: 'So your colleagues can tell who is who.' },
    promises: [PROMISE.sentWithIt, PROMISE.youCanRemove],
    cancel: { k: 'common.cancel', d: 'Not now' },
  },
} as const satisfies Record<string, Purpose>;

export type MediaPurpose = keyof typeof PURPOSES;

/** The registry entry, or a refusal to guess. */
export function purposeOf(p: MediaPurpose): Purpose {
  return PURPOSES[p];
}
