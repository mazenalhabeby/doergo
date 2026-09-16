import type { WorkLogNote } from '../../lib/api/worklog';
import { worklogApi } from '../../lib/api/worklog';
import { outcomeOf, STILL_MINE, type ActionOutcome } from '../actions/outcome';
import type { RecordsStore } from '../db/records-store';
import type { OfflineFiles } from '../files/offline-files';
import { uuidv7 } from '../ids';
import type { OutboxOp } from '../outbox/types';
import type { SyncEngine } from '../sync-engine';
import { isUnreachable } from '../actions/unreachable';
import { openOpFor } from '../outbox/open-ops';

const SCOPE = 'worklog';

export interface WorklogPhoto {
  uri: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
}

/** A note as the sheet shows it: the server's, or one still on the phone. */
export type WorklogItem = WorkLogNote & { pendingSync?: boolean };

/*
  The work log has its own lane, `worklog:<entryId>`, not the shift's.

  A photo that will not upload holds its lane — and a clock-out behind it in
  the same lane would wait with it, for as long as the upload keeps failing.
  Notes still wait for the clock-in when that is on its way too.
*/
const laneOf = (entryId: string) => `worklog:${entryId}`;

/**
 * Write a note, with photos, into a shift's work log — with or without signal.
 *
 * The photos are kept on the phone first. The note is queued; if the server
 * refuses it outright the photos are dropped with it, otherwise each photo is
 * queued behind the note it belongs to and uploaded when it is sent.
 */
export async function addWorklogEntry(
  engine: SyncEngine,
  files: OfflineFiles,
  input: { entryId: string; body: string; photos: WorklogPhoto[]; at?: string },
): Promise<{ noteId: string; outcome: ActionOutcome }> {
  const noteId = uuidv7();
  const kept = [];
  for (const p of input.photos) {
    const id = uuidv7();
    const file = await files.keep({ id, kind: 'photo', mime: p.mimeType, width: p.width, height: p.height, uri: p.uri });
    kept.push({ photo: p, file });
  }

  const clockIn = openOpFor(engine.operations(), 'attendance.clockIn', (b) => b.id === input.entryId);
  const note = await engine.enqueueAndSettle({
    op: 'worklog.note',
    lane: laneOf(input.entryId),
    entityId: input.entryId,
    dependsOn: clockIn ? [clockIn.id] : [],
    payload: {
      params: { entryId: input.entryId },
      body: { id: noteId, body: input.body, at: input.at ?? new Date().toISOString() },
    },
  });
  const outcome = await outcomeOf(engine, note);
  if (outcome.kind === 'refused') {
    for (const { file } of kept) await files.forget(file.id);
    return { noteId, outcome };
  }

  for (const { photo, file } of kept) {
    await engine.enqueue({
      op: 'worklog.attachment',
      lane: laneOf(input.entryId),
      entityId: input.entryId,
      dependsOn: note.state === 'done' ? [] : [note.id],
      payload: {
        params: { noteId },
        body: {
          id: file.id,
          fileName: photo.fileName,
          mimeType: file.mime,
          ...(file.width ? { width: file.width } : {}),
          ...(file.height ? { height: file.height } : {}),
        },
      },
    });
  }
  return { noteId, outcome };
}

/**
 * The work log as the member sees it: the server's notes with everything still
 * on the phone laid on top — notes it does not have yet, and photos still
 * uploading (onto their own note, whichever side that note is on). Photos
 * point at the copies kept on the phone. Computed on every read, never stored.
 */
export function worklogView(
  server: readonly WorkLogNote[],
  entryId: string,
  ops: readonly OutboxOp[],
  uriFor: (id: string, mime: string) => string,
): WorklogItem[] {
  const photos = new Map<string, WorkLogNote['attachments']>();
  for (const o of ops) {
    if (o.op !== 'worklog.attachment' || o.entityId !== entryId || !STILL_MINE.has(o.state)) continue;
    const b = (o.payload.body ?? {}) as { id: string; fileName?: string; mimeType?: string };
    const mime = b.mimeType ?? 'image/jpeg';
    const noteId = o.payload.params?.noteId ?? '';
    const local = { id: b.id, fileName: b.fileName ?? '', mimeType: mime, fileUrl: uriFor(b.id, mime), url: uriFor(b.id, mime) };
    photos.set(noteId, [...(photos.get(noteId) ?? []), local as WorkLogNote['attachments'][number]]);
  }

  const withPhotos = (n: WorkLogNote, pendingSync: boolean): WorklogItem => {
    const extra = photos.get(n.id) ?? [];
    const known = new Set(n.attachments.map((a) => a.id));
    const added = extra.filter((a) => !known.has(a.id));
    return { ...n, attachments: [...n.attachments, ...added], pendingSync: pendingSync || added.length > 0 };
  };

  const seen = new Set(server.map((n) => n.id));
  const items = server.map((n) => withPhotos(n, false));
  for (const o of ops) {
    if (o.op !== 'worklog.note' || o.entityId !== entryId || !STILL_MINE.has(o.state)) continue;
    const b = (o.payload.body ?? {}) as { id: string; body?: string; at?: string };
    if (seen.has(b.id)) continue;
    const note = { id: b.id, timeEntryId: entryId, body: b.body ?? '', at: b.at ?? new Date(o.createdAt).toISOString(), attachments: [] } as unknown as WorkLogNote;
    items.push(withPhotos(note, true));
  }
  return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** The session's notes from the server, saved for next time; the saved copy when there is no signal. */
export async function loadWorklog(entryId: string, records: RecordsStore | null): Promise<WorkLogNote[]> {
  try {
    const notes = await worklogApi.list(entryId);
    if (records) void records.replaceChildren(SCOPE, entryId, notes as never).catch(() => undefined);
    return notes;
  } catch (err) {
    if (!records || !isUnreachable(err)) throw err;
    return (await records.listByParent<WorkLogNote>(SCOPE, entryId)).map((r) => r.data);
  }
}
