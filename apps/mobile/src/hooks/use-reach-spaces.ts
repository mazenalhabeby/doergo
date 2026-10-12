import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/auth-context';
import { locationsApi } from '../lib/api';
import { holdsIn } from '../lib/permissions';

export interface ReachSpace {
  id: string;
  name: string;
}

/**
 * The workspaces where this member may open a module's screen: the workspace
 * runs the module AND the member holds `key` there (org-wide counts for every
 * workspace) — the server's own rule, so a chip never leads to a 404.
 *
 * The same shape as `useCrmSpaces`, for the register (`assets` /
 * `canViewAssets`) and client requests (`b2c_portal` / `canViewPortal`). A
 * failed read is an empty list; `loaded` tells "none" from "not yet".
 */
export function useReachSpaces(module: string, key: string): { spaces: ReachSpace[]; loaded: boolean } {
  const { user } = useAuth();
  const [state, setState] = useState<{ spaces: ReachSpace[]; loaded: boolean }>({ spaces: [], loaded: false });
  useEffect(() => {
    let alive = true;
    locationsApi.list()
      .then((rows) => {
        if (!alive) return;
        const spaces = rows
          .filter((x) => !(x as { isRemote?: boolean }).isRemote)
          .filter((x) => (x.enabledModules ?? []).includes(module))
          .filter((x) => holdsIn(user as never, key, x.id))
          .map((x) => ({ id: x.id, name: x.name }));
        setState({ spaces, loaded: true });
      })
      .catch(() => { if (alive) setState({ spaces: [], loaded: true }); });
    return () => { alive = false; };
  }, [module, key, user]);
  return state;
}
