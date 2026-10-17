/**
 * The task-type library.
 *
 * One table serving two audiences with opposite rights: the platform curates it,
 * every tenant reads it, and no tenant writes to it. The split lives in this
 * file's method names — `list…`/`useTemplate` are tenant-facing and only ever
 * see published rows; the `curate…` methods are reachable only through the
 * platform-staff guard.
 *
 * The important decision is that using a template COPIES it. See the model
 * comment in schema.prisma: a live reference would let a curator's edit rewrite
 * the state machine under tasks that are already moving through it.
 */
/** What a task type contributes to the library: its name and its steps, in order. */
const TEMPLATE_SOURCE_SELECT = {
  name: true,
  statuses: {
    orderBy: { position: 'asc' as const },
    select: {
      name: true, key: true, color: true, icon: true, position: true,
      isFinal: true, isCanceled: true, transitions: true, capabilities: true, form: true,
    },
  },
} as const;

export { TEMPLATE_SOURCE_SELECT };
