import { fetchWithAuth } from './client';
import type { RouteOptimizeRequest, OptimizedRoute } from '@hbcfield/shared/client';

// Multi-stop route optimizer (stateless; OSRM /trip on the gateway). Field-only.
export const routesApi = {
  optimize: (req: RouteOptimizeRequest): Promise<OptimizedRoute> =>
    fetchWithAuth<OptimizedRoute>('/routes/optimize', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
};
