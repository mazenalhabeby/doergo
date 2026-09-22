/**
 * How many sheets one document may hold.
 *
 * Not a storage limit — it is the point past which somebody is photographing a
 * folder rather than a document, and every later reader pays for it.
 *
 * ⚠️ Shared because BOTH ends need the same number. The server refuses a
 * thirty-first sheet; the phone must stop offering to add one, or the member
 * photographs it, watches it upload and is then told the whole document is too
 * long. One constant, one answer.
 */
export const MAX_PAGES = 30;
