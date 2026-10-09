import { useEffect, useState } from 'react';
import { locationsApi } from '../lib/api';

export interface CrmSpace {
  id: string;
  name: string;
}

/**
 * The workspaces that run CRM — where a client may be filed.
 *
 * One reader for every place that offers the choice (the client list's chips,
 * Add client, the contacts import). A workspace without CRM is left out: a
 * client filed there is refused by the server, and a chip for it always
 * returns nothing. A failed read is an empty list — the choice simply does not
 * appear, and the server still decides.
 */
export function useCrmSpaces(): CrmSpace[] {
  const [spaces, setSpaces] = useState<CrmSpace[]>([]);
  useEffect(() => {
    let alive = true;
    locationsApi.list()
      .then((rows) => {
        if (alive) setSpaces(rows.filter((x) => (x.enabledModules ?? []).includes('crm')).map((x) => ({ id: x.id, name: x.name })));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return spaces;
}
