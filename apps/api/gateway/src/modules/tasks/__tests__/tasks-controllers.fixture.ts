import { readFileSync } from 'fs';
import { join } from 'path';
import { combinedServices } from '../../../common/testing/combined-services';
import { TasksController } from '../tasks.controller';
import { TaskListController } from '../task-list.controller';
import { TaskCrewController } from '../task-crew.controller';
import { TaskActivityController } from '../task-activity.controller';
import { TaskChecklistController } from '../task-checklist.controller';
import { TaskAttachmentsController } from '../task-attachments.controller';

/** Every /tasks controller — one class until 2026-10-17, split by job since. In the module's order. */
export const TASK_CONTROLLERS = [
  TaskListController,
  TasksController,
  TaskCrewController,
  TaskActivityController,
  TaskChecklistController,
  TaskAttachmentsController,
] as const;

type Public<T> = { [K in keyof T]: T[K] };
export type TaskControllers = Public<TasksController> &
  Public<TaskListController> &
  Public<TaskCrewController> &
  Public<TaskActivityController> &
  Public<TaskChecklistController> &
  Public<TaskAttachmentsController>;

/** All of them over the same two services, as one object. */
export function tasksControllers(queue: unknown, direct: unknown): TaskControllers {
  return combinedServices<TaskControllers>(...TASK_CONTROLLERS.map((C) => new C(queue as never, direct as never)));
}

/** The route handler named `name`, from whichever controller owns it (for its decorator metadata). */
export function taskRoute(name: string): (...a: unknown[]) => unknown {
  for (const C of TASK_CONTROLLERS) {
    if (Object.prototype.hasOwnProperty.call(C.prototype, name))
      return (C.prototype as unknown as Record<string, never>)[name];
  }
  throw new Error(`no /tasks route ${name}`);
}

/** The source of every /tasks controller (and their base), concatenated — for the tests that read decorators as text. */
export const TASK_CONTROLLER_FILES = [
  'tasks-controller.base.ts',
  'task-list.controller.ts',
  'tasks.controller.ts',
  'task-crew.controller.ts',
  'task-activity.controller.ts',
  'task-checklist.controller.ts',
  'task-attachments.controller.ts',
];
export function tasksControllerSource(): string {
  return TASK_CONTROLLER_FILES.map((f) => readFileSync(join(__dirname, '..', f), 'utf8')).join('\n');
}
