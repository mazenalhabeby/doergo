import { TaskStatus } from '@hbcfield/shared';

/** Statuses that are certainly over — the indexed half of "still open"; `isWorkOver` is the rest. */
import type { RoleTaskFacts } from '@hbcfield/shared/microservices';

const OVER = [TaskStatus.COMPLETED, TaskStatus.CANCELED, TaskStatus.CLOSED];

const DAY_MS = 86_400_000;

/** openWave past the creator's alert: closed at a finished step — never re-offered, places never reopen. */
export const ROLE_WAVE_CLOSED = 3;

type OpenRole = { id: string; name: string };

type Facts = RoleTaskFacts;

export { OVER, DAY_MS, OpenRole, Facts };
