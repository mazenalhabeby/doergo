import { type AssetActor } from '../core/asset-access.service';
import { AssetCustodyService } from '../custody/asset-custody.service';
import type { ContractFieldsMessage } from '@hbcfield/shared/microservices';
import type { ParsedContract } from '@hbcfield/shared';

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

/**
 * Is a kind in a workspace this caller may manage?
 *
 * A kind in NO workspace is refused to a space-scoped caller: it belongs to
 * nobody's space, so no space grant can reach it — only an org-wide one.
 */
export function kindInScope(
  kindSpaceId: string | null | undefined,
  manageSpaceIds: string[] | null | undefined,
): boolean {
  if (manageSpaceIds === null) return true;
  return !!kindSpaceId && Array.isArray(manageSpaceIds) && manageSpaceIds.includes(kindSpaceId);
}

/**
 * A person's corrections → the shape the shared rules read.
 *
 * Everything here is `certain`, and that is not a claim about the OCR: it is
 * a statement that a human has looked at these values and pressed a button.
 * The confidence the reader assigned did its job on the screen before this.
 */
export function asParsedContract(fields: ContractFields): ParsedContract {
  const v = (value?: string) =>
    value && value.trim()
      ? { value: value.trim().slice(0, 120), confidence: 'certain' as const, raw: value.trim() }
      : undefined;
  return {
    registration: v(fields.registration),
    vin: v(fields.vin),
    serial: v(fields.serial),
    manufacturer: v(fields.manufacturer),
    model: v(fields.model),
    startsOn: v(fields.startsOn),
    endsOn: v(fields.endsOn),
    lines: [],
  };
}

export { Db };
