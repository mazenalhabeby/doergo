"use client"

/** AttachmentsSection's module-level helpers, moved here unchanged so its sections can read them too. */
export function isImageType(fileType: string): boolean {
  return fileType.startsWith("image/")
}
