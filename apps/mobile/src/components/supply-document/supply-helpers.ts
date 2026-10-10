import { File as FsFile } from 'expo-file-system';

export const MAX_BYTES = 20 * 1024 * 1024;

/** The file's real length, or 0 if it cannot be read. Never throws at the caller. */
export function safeFileSize(uri: string): number {
  try {
    return new FsFile(uri).size ?? 0;
  } catch {
    return 0;
  }
}

/** A calendar date, in the phone's own day — never a UTC-shifted one. */
export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The gallery picker, handed down from the ONE `useImagePicker` the sheet holds. */
export type PickFromGallery = ReturnType<typeof import('../../hooks/useImagePicker').useImagePicker>['pickFromGallery'];
