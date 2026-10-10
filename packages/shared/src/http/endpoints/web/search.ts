/**
 * search — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';

export const searchWebEndpoints = defineEndpoints('search', {
  global: endpoint<void, unknown>({ method: 'GET', path: () => '/search' }),
});
