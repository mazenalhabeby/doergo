/**
 * A file the phone is holding for an operation that has not been sent yet.
 *
 * Its id IS the id of the record it becomes (the attachment id the phone made),
 * so the operation finds its file by its own body — there is no link to write,
 * and so no moment where the operation exists and its file cannot be found.
 */
export interface StoredFile {
  id: string;
  /** `file://` URI in the app's documents directory — never the cache the camera wrote to. */
  path: string;
  kind: FileKind;
  mime: string;
  bytes: number | null;
  width?: number;
  height?: number;
  takenAt?: number;
  state: 'kept' | 'uploaded';
  /** Where it was uploaded. Set once the PUT succeeded, before the confirm is sent. */
  objectKey?: string;
  createdAt: number;
}

export type FileKind = 'photo' | 'signature';

/** The files table. SQLite on a phone, memory in tests. */
export interface FileRegistry {
  add(file: StoredFile): Promise<void>;
  get(id: string): Promise<StoredFile | null>;
  markUploaded(id: string, objectKey: string): Promise<void>;
  /** Remove the row; returns what it was, so its bytes can be deleted too. */
  remove(id: string): Promise<StoredFile | null>;
  /** How many files are held, and how big — for the Sync screen. */
  totals(): Promise<{ count: number; bytes: number }>;
}

/** Where a file's bytes live. The device's documents directory on a phone. */
export interface FileDisk {
  keep(input: KeepInput): Promise<{ path: string; bytes: number | null; mime: string; width?: number; height?: number }>;
  remove(path: string): Promise<void>;
}

export type KeepInput = {
  id: string;
  mime: string;
  width?: number;
  height?: number;
} & ({ uri: string } | { base64: string });

/** The two network steps of an upload. Throws `UploadFailure`. */
export interface ObjectUploader {
  /** `body` is shaped by the route — see uploads.ts. */
  presign(path: string, body: Record<string, string>): Promise<{ uploadUrl: string; fileKey: string }>;
  put(uploadUrl: string, path: string, mime: string): Promise<void>;
}

/** An upload step that did not work, classified like an HTTP answer (null = no network). */
export class UploadFailure extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string,
  ) {
    super(code);
  }
}
