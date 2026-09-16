import type { ShiftIssueEvent } from '../../lib/api/shift-issues';
import { outcomeOf, STILL_MINE, type ActionOutcome } from '../actions/outcome';
import { openOpFor } from '../outbox/open-ops';
import type { OfflineFiles } from '../files/offline-files';
import { uuidv7 } from '../ids';
import type { OutboxOp } from '../outbox/types';
import type { SyncEngine } from '../sync-engine';

export interface IssuePhoto {
  uri: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
}

/*
  Everything about one issue travels in its own lane, `issue:<id>`, so its
  messages arrive in the order they were written and never before the issue.
*/
const laneOf = (issueId: string) => `issue:${issueId}`;

/**
 * Queue each photo as a message of its own, behind whatever it depends on.
 * The upload fills the attachment in (see uploads.ts, shiftIssue.message).
 */
async function queuePhotos(engine: SyncEngine, files: OfflineFiles, issueId: string, photos: IssuePhoto[], after: OutboxOp | undefined) {
  for (const p of photos) {
    const id = uuidv7();
    const file = await files.keep({ id, kind: 'photo', mime: p.mimeType, width: p.width, height: p.height, uri: p.uri });
    await engine.enqueue({
      op: 'shiftIssue.message',
      lane: laneOf(issueId),
      dependsOn: after && after.state !== 'done' ? [after.id] : [],
      payload: { params: { issueId }, body: { id: file.id, body: '', photoPending: true, photoName: p.fileName, photoMime: file.mime } },
    });
  }
}

/** Report a blocker, with photos, with or without signal. */
export async function reportIssueFromPhone(
  engine: SyncEngine,
  files: OfflineFiles,
  input: { title: string; description?: string; severity?: string; timeEntryId?: string; spaceId?: string; photos: IssuePhoto[] },
): Promise<{ issueId: string; outcome: ActionOutcome }> {
  const issueId = uuidv7();
  // A shift clocked in offline is not on the server yet; the issue waits for it.
  const clockIn = input.timeEntryId ? openOpFor(engine.operations(), 'attendance.clockIn', (b) => b.id === input.timeEntryId) : undefined;
  const create = await engine.enqueueAndSettle({
    op: 'shiftIssue.create',
    lane: laneOf(issueId),
    dependsOn: clockIn ? [clockIn.id] : [],
    payload: {
      body: {
        id: issueId,
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.timeEntryId ? { timeEntryId: input.timeEntryId } : {}),
        ...(input.spaceId ? { spaceId: input.spaceId } : {}),
      },
    },
  });
  const outcome = await outcomeOf(engine, create);
  if (outcome.kind !== 'refused') await queuePhotos(engine, files, issueId, input.photos, create);
  return { issueId, outcome };
}

/** Write into an issue's thread, with photos, with or without signal. */
export async function sendIssueMessageFromPhone(
  engine: SyncEngine,
  files: OfflineFiles,
  input: { issueId: string; body: string; photos: IssuePhoto[] },
): Promise<ActionOutcome> {
  const create = openOpFor(engine.operations(), 'shiftIssue.create', (b) => b.id === input.issueId);
  let outcome: ActionOutcome = { kind: 'done', response: null };
  let text: OutboxOp | undefined;
  if (input.body.trim()) {
    text = await engine.enqueueAndSettle({
      op: 'shiftIssue.message',
      lane: laneOf(input.issueId),
      dependsOn: create ? [create.id] : [],
      payload: { params: { issueId: input.issueId }, body: { id: uuidv7(), body: input.body.trim() } },
    });
    outcome = await outcomeOf(engine, text);
    if (outcome.kind === 'refused') return outcome;
  }
  await queuePhotos(engine, files, input.issueId, input.photos, text ?? create);
  return input.photos.length && outcome.kind === 'done' ? { kind: 'queued' } : outcome;
}

/**
 * What the member has written into this issue that the server does not have
 * yet, shaped like its thread, photos pointing at the kept copies.
 */
export function pendingIssueEvents(issueId: string, ops: readonly OutboxOp[], uriFor: (id: string, mime: string) => string, me: { id: string; name: string }): ShiftIssueEvent[] {
  return ops
    .filter((o) => o.op === 'shiftIssue.message' && STILL_MINE.has(o.state) && o.payload.params?.issueId === issueId)
    .map((o) => {
      const b = (o.payload.body ?? {}) as { id: string; body?: string; photoPending?: boolean; photoName?: string; photoMime?: string };
      const mime = b.photoMime ?? 'image/jpeg';
      const photo = b.photoPending ? [{ id: b.id, fileUrl: uriFor(b.id, mime), url: uriFor(b.id, mime), fileName: b.photoName ?? '', mimeType: mime }] : [];
      return {
        id: b.id, type: 'MESSAGE', actorId: me.id, actorName: me.name, body: b.body || null,
        attachments: photo, at: new Date(o.createdAt).toISOString(), pendingSync: true,
      } as ShiftIssueEvent & { pendingSync: boolean };
    });
}
