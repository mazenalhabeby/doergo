import type { AnyEndpoint } from './define';

/**
 * A query key derived from an endpoint's NAME and its arguments — never typed
 * by hand, so the screen that reads `tasks.get` and the mutation that
 * invalidates it cannot disagree about the spelling.
 *
 *   queryKey(tasksEndpoints.get, { id: 't1' })  → ['tasks', 'get', { id: 't1' }]
 *   queryKey('tasks.list')                       → ['tasks', 'list']
 *   domainKey('tasks')                           → ['tasks']   (invalidate the whole domain)
 *
 * Deterministic: object keys are sorted at every depth and `undefined` values
 * dropped, so `{ a: 1, b: undefined }` and `{ a: 1 }` are one key; Dates become
 * ISO strings. Arrays keep their order — order is meaning there.
 */
export type QueryKey = readonly unknown[];

export function stableArgs(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : stableArgs(v)));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v === undefined) continue;
      out[k] = stableArgs(v);
    }
    return out;
  }
  return value;
}

export function queryKey(def: AnyEndpoint | string, args?: unknown): QueryKey {
  const name = typeof def === 'string' ? def : def.name;
  if (!name) throw new Error('queryKey: this endpoint has no name — define it with defineEndpoints()');
  const parts: unknown[] = name.split('.');
  const stable = stableArgs(args);
  const empty =
    stable === undefined ||
    stable === null ||
    (typeof stable === 'object' && !Array.isArray(stable) && Object.keys(stable as object).length === 0);
  if (!empty) parts.push(stable);
  return parts;
}
