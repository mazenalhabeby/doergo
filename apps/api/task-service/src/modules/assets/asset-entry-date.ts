import { BadRequestException } from '@nestjs/common';
import { assetEntryDateMessage, assetEntryDateProblem } from '@hbcfield/shared';

/**
 * Read the date of something filed against an asset, or refuse it.
 *
 * ⚠️ THE ONE DOOR for every route that writes an `AssetMoney` row with a date —
 * the logbook, a member's expense, the office's Money tab. They used to carry
 * their own copies ("120 days", "a day of grace") and the expense copy exempted
 * nobody, so the office could log last year's service and was refused last
 * year's invoice for the same van. The rule itself is `assetEntryDateProblem`
 * in shared, which the phone's calendar and the web's picker bound days by; this
 * only turns its answer into the refusal every route sends.
 *
 * `canManageAssets` is what the gateway hands over: the flat, ORG-WIDE column.
 */
export function readAssetEntryDate(
  raw: string | undefined,
  actor: { canManageAssets?: boolean },
  now = new Date(),
): Date {
  const at = raw ? new Date(raw) : now;
  if (Number.isNaN(at.getTime())) throw new BadRequestException(assetEntryDateMessage('unreadable'));
  const problem = assetEntryDateProblem(at, { canManageAssets: actor.canManageAssets, now });
  if (problem) throw new BadRequestException(assetEntryDateMessage(problem));
  return at;
}
