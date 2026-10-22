/**
 * Published reads of tracking-service's live map table (`WorkerLastLocation`) — see db.ts.
 * Owner: tracking-service.
 */
import type { On } from './db';

/** Where these people were last seen, and when. */
export function lastPositions(db: On<'workerLastLocation', 'findMany'>, userIds: string[]) {
  return db.workerLastLocation.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, lat: true, lng: true, updatedAt: true },
  });
}

/** Where these people were last seen (coordinates only). */
export function lastPoints(db: On<'workerLastLocation', 'findMany'>, userIds: string[]) {
  return db.workerLastLocation.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, lat: true, lng: true },
  });
}

/** Where one person was last seen (null = never). */
export function lastPointOf(db: On<'workerLastLocation', 'findUnique'>, userId: string) {
  return db.workerLastLocation.findUnique({ where: { userId }, select: { lat: true, lng: true } });
}
