import { pickUnitFields } from '@hbcfield/shared';
import type { RpcContract } from '@hbcfield/shared/microservices';

/**
 * A unit body's editable fields, typed as the message they go into.
 *
 * `pickUnitFields` keeps only the editable KEYS; their values are not checked
 * at the gateway — the unit service reads them as its own types. This states
 * that once, instead of a cast at each of the unit routes.
 */
export function unitFieldsFor<Req>(
  _contract: RpcContract<Req, unknown>,
  body: unknown,
  opts?: { relations?: boolean },
): Partial<Req> {
  return pickUnitFields(body, opts) as Partial<Req>;
}
