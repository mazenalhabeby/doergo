import type { OccurrenceFix } from '@hbcfield/shared/client';
import { captureEvidence } from '../clock';
import { uuidv7 } from '../ids';
import type { SyncEngine } from '../sync-engine';
import type { OutboxOp } from '../outbox/types';
import type { OfflineFiles } from '../files/offline-files';
import type { FileKind } from '../files/types';
import { outcomeOf, type ActionOutcome } from '../actions/outcome';

export type { ActionOutcome };

/**
 * Change a task's status, from wherever the member is.
 *
 * Carries the status they saw (a changed task is refused, not overwritten), the
 * moment of the tap and — for arriving or starting — the GPS fix taken at the
 * tap, so a change synced later is judged by where and when it happened.
 */
export async function changeTaskStatus(
  engine: SyncEngine,
  input: { taskId: string; from: string; to: string; reason?: string; fix?: OccurrenceFix | null },
): Promise<ActionOutcome> {
  const op = await engine.enqueueAndSettle({
    op: 'task.status',
    lane: `task:${input.taskId}`,
    entityId: input.taskId,
    payload: {
      params: { taskId: input.taskId },
      body: {
        status: input.to,
        expectedFrom: input.from,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.fix ? { lat: input.fix.lat, lng: input.fix.lng, accuracy: input.fix.accuracy } : {}),
        evidence: captureEvidence(input.fix),
      },
    },
  });
  return outcomeOf(engine, op);
}

/**
 * Add a photo (or a signature) to a task, with or without a network.
 *
 * The file is copied into the member's held files first, then the confirm is
 * queued under the id the attachment will have on the server. The upload
 * itself happens when the engine sends it — see FileUploadPreparer.
 */
export async function addTaskPhoto(
  engine: SyncEngine,
  files: OfflineFiles,
  input: { taskId: string; fileName: string; mime: string; width?: number; height?: number; kind?: FileKind } & (
    | { uri: string }
    | { base64: string }
  ),
): Promise<{ id: string; outcome: ActionOutcome }> {
  const id = uuidv7();
  const { taskId, fileName, kind = 'photo', ...source } = input;
  const file = await files.keep({ ...source, id, kind });
  let op: OutboxOp;
  try {
    op = await engine.enqueueAndSettle(
      {
        op: 'task.attachment',
        lane: `task:${taskId}`,
        entityId: taskId,
        payload: {
          params: { taskId },
          body: { id, fileName: renameForType(fileName, file.mime), fileType: file.mime, fileSize: file.bytes ?? undefined },
        },
      },
      // An upload takes longer than a status change; still, never hold the screen for long.
      15_000,
    );
  } catch (err) {
    await files.forget(id);
    throw err;
  }
  return { id, outcome: await outcomeOf(engine, op) };
}

/** A HEIC kept as JPEG must not keep its .heic name — the web would offer the wrong viewer. */
function renameForType(fileName: string, mime: string): string {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : null;
  if (!ext) return fileName;
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return `${base || 'photo'}.${ext}`;
}

/**
 * Hand a job back. Offline it is kept and sent later; if the office has
 * reassigned or moved the job by then, the refusal says so in words.
 */
export async function declineTask(engine: SyncEngine, input: { taskId: string }): Promise<ActionOutcome> {
  const op = await engine.enqueueAndSettle({
    op: 'task.decline',
    lane: `task:${input.taskId}`,
    entityId: input.taskId,
    payload: { params: { taskId: input.taskId } },
  });
  return outcomeOf(engine, op);
}

/** Add a note. The phone names it, so a resend can never make a second one. */
export async function addTaskComment(
  engine: SyncEngine,
  input: { taskId: string; content: string },
): Promise<{ id: string; outcome: ActionOutcome }> {
  const id = uuidv7();
  const op = await engine.enqueueAndSettle({
    op: 'task.comment',
    lane: `task:${input.taskId}`,
    entityId: input.taskId,
    payload: { params: { taskId: input.taskId }, body: { id, content: input.content } },
  });
  return { id, outcome: await outcomeOf(engine, op) };
}
