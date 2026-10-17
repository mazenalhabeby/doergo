import { type AssetActor } from './asset-access.service';
import { AssetCustodyService } from './asset-custody.service';

/** What a client sends: the reading, after a person has corrected it. */
export interface ContractFields {
  name?: string;
  registration?: string;
  vin?: string;
  serial?: string;
  manufacturer?: string;
  model?: string;
  startsOn?: string;
  endsOn?: string;
}

type Db = Parameters<AssetCustodyService['apply']>[0];

/**
 * Who is acting, and where they may — the register's own actor.
 *
 * `manageSpaceIds` follows the three states the rest of the codebase uses:
 * null = org-wide, an array = only kinds in those workspaces, and an EMPTY
 * array = nowhere. ⚠️ Absent is NOWHERE now (see `AssetActor`): it used to mean
 * org-wide here, so a caller that forgot to forward the list was handed every
 * workspace's fleet.
 */
export type ContractActor = AssetActor;

export { Db };
