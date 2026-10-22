import { type AssetActor } from '../core/asset-access.service';
import { AssetCustodyService } from '../custody/asset-custody.service';
import type { ContractFieldsMessage } from '@hbcfield/shared/microservices';

/** What a client sends: the reading, after a person has corrected it. */
export type ContractFields = ContractFieldsMessage;

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
