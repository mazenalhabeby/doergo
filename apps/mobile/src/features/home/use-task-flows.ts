import { useEffect, useMemo, useRef, useState } from 'react';
import { tasksApi } from '@/lib/api';
import type { Task } from '@/lib/api/types';
import { useConnectivity, useOffline } from '@/offline/offline-context';
import { knownOffline } from '@/offline/connectivity';
import { flowIdOf } from './my-work';

/**
 * The workflows a list of jobs runs on, from the offline engine's copy — the
 * same lookup the task screen does. A row whose workflow is not here offers
 * no verb (it opens the job) rather than guessing the field-service one.
 *
 * Read by the home's My work card AND the Jobs tab, so a job's step reads the
 * same words in both places and the Next up button offers the same verb.
 *
 * ⚠️ A workflow that could not be asked for offline is asked again when the
 * signal returns — keyed on the set of ids alone, it waited for the NEXT
 * job on a new workflow, and until then its rows could only open the job.
 */
export function useTaskFlows(tasks: readonly Task[]): Map<string, unknown> {
  const offline = useOffline();
  const online = useConnectivity() === 'online';
  const flowIds = useMemo(() => [...new Set(tasks.map(flowIdOf).filter((x): x is string => !!x))].sort().join(','), [tasks]);
  // The rows themselves are only read for a sample job per missing workflow.
  const rows = useRef(tasks);
  rows.current = tasks;
  const [flows, setFlows] = useState<Map<string, unknown>>(() => new Map());
  useEffect(() => {
    if (!flowIds) return;
    const records = offline.records;
    let live = true;
    void (async () => {
      const next = new Map<string, unknown>();
      for (const id of flowIds.split(',')) {
        const row = records ? await records.get<unknown>('workflows', id).catch(() => null) : null;
        if (row?.data) { next.set(id, row.data); continue; }
        /*
          ⚠️ NOT ON THIS PHONE — ASK THE JOB. The phone's copy of workflows can
          lag its copy of tasks (the iPhone showed "Open the job" where the
          emulator showed "Arrived", 02.png / 21:20). `GET /tasks/:id` already
          carries the job's full workflow, so one job per missing workflow is
          asked for it. Offline this fails quietly and the row opens the job,
          which is the honest answer when the verbs are unknown.
        */
        const sample = rows.current.find((x) => flowIdOf(x) === id);
        /* ⚠️ With no network it cannot answer — the row opens the job, as below, without the failed round trip. */
        if (!sample || knownOffline()) continue;
        const detail = await tasksApi.getById(sample.id).catch(() => null);
        const flow = (detail as unknown as { workflow?: { id?: string } } | null)?.workflow;
        if (flow) next.set(id, flow);
      }
      if (live) setFlows(next);
    })();
    return () => { live = false; };
  }, [offline.records, flowIds, online]);
  return flows;
}
