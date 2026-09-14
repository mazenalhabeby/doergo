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
  input: { taskId: string; fileName: string; mime: string; width?: number; height?: number; kind?: FileKind; dependsOn?: string[] } & (
    | { uri: string }
    | { base64: string }
  ),
): Promise<{ id: string; outcome: ActionOutcome }> {
  const id = uuidv7();
  const { taskId, fileName, kind = 'photo', dependsOn, ...source } = input;
  const file = await files.keep({ ...source, id, kind });
  let op: OutboxOp;
  try {
    op = await engine.enqueueAndSettle(
      {
        op: 'task.attachment',
        lane: `task:${taskId}`,
        entityId: taskId,
        // A photo on a task created offline waits for the task to exist.
        dependsOn,
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

export interface ReportPhoto {
  uri: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  side: 'BEFORE' | 'AFTER';
}

/**
 * Complete a job with its service report, with or without signal.
 *
 * The report goes first, under the id it will have on the server; each before
 * and after photo is kept on the phone and queued behind it in the same lane,
 * uploaded when sent. A photo can no longer be lost because the report's
 * answer was slow — it waits for the report, however long that takes.
 *
 * Signatures stay inline: they are line art of a few kilobytes and the web
 * and the report PDF read them as images directly.
 */
export async function completeTaskWithReport(
  engine: SyncEngine,
  files: OfflineFiles,
  input: {
    taskId: string;
    report: {
      summary: string;
      workPerformed?: string;
      workDuration: number;
      technicianSignature?: string;
      customerSignature?: string;
      customerName?: string;
    };
    photos: ReportPhoto[];
  },
): Promise<{ reportId: string; outcome: ActionOutcome }> {
  const reportId = uuidv7();
  const kept = [];
  for (const p of input.photos) {
    const file = await files.keep({ id: uuidv7(), kind: 'photo', mime: p.mimeType, width: p.width, height: p.height, uri: p.uri });
    kept.push({ photo: p, file });
  }

  let complete: OutboxOp;
  try {
    complete = await engine.enqueueAndSettle({
      op: 'task.complete',
      lane: `task:${input.taskId}`,
      entityId: input.taskId,
      payload: { params: { taskId: input.taskId }, body: { id: reportId, ...input.report, evidence: captureEvidence() } },
    });
  } catch (err) {
    for (const { file } of kept) await files.forget(file.id);
    throw err;
  }
  const outcome = await outcomeOf(engine, complete);
  if (outcome.kind === 'refused') {
    for (const { file } of kept) await files.forget(file.id);
    return { reportId, outcome };
  }

  for (const { photo, file } of kept) {
    await engine.enqueue({
      op: 'report.attachment',
      lane: `task:${input.taskId}`,
      entityId: input.taskId,
      dependsOn: complete.state === 'done' ? [] : [complete.id],
      payload: {
        params: { reportId },
        body: { id: file.id, type: photo.side, fileName: renameForType(photo.fileName, file.mime), fileType: file.mime },
      },
    });
  }
  return { reportId, outcome };
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
