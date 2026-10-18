/**
 * One queued job between the gateway and a service, typed at both ends.
 *
 * The queue is unchanged: a contract IS the job name BullMQ already uses, and the
 * data/result types exist only for the compiler — the same idea as `rpc()` for
 * the message patterns (microservices/contract.ts). Before this, the gateway
 * queued `Record<string, any>` and the processor read `job.data` as `any`, so a
 * field renamed on one side was silently `undefined` on the other.
 *
 *   // shared:   export const TASK_JOBS = { create: job<TaskCreateJob>(TASK_JOB_TYPES.CREATE), … }
 *   // gateway:  return this.runJob(TASK_JOBS.create, { … })          (BaseQueueService)
 *   // service:  a dispatch table typed by `JobData<typeof TASK_JOBS.create>`
 */
export interface JobContract<Data, Result = unknown> {
  readonly name: string;
  /** Phantom: never set, never queued — it only carries the two types. */
  readonly __types?: { data: Data; result: Result };
}

export function job<Data, Result = unknown>(name: string): JobContract<Data, Result> {
  return { name };
}

export type JobData<C> = C extends JobContract<infer Data, unknown> ? Data : never;

/** A processor's table: one handler per contract, each typed by that contract's data. */
export type JobHandlers<M extends Record<string, JobContract<unknown, unknown>>> = {
  [K in keyof M]: (data: JobData<M[K]>) => Promise<unknown> | unknown;
};

/** A processor's way back from the job name on the wire to its contract. */
export function jobKeysByName<M extends Record<string, JobContract<unknown, unknown>>>(
  jobs: M,
): ReadonlyMap<string, keyof M> {
  return new Map(Object.entries(jobs).map(([key, contract]) => [contract.name, key as keyof M]));
}
