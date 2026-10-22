import { hasAccessModule, hasFeatureModule, moduleAnywhere, type MobileModule } from '@hbcfield/shared/client';
import { holds, holdsOrgWide } from '@/lib/permissions';
import type { User } from '@/lib/api/types';
import { crmCapsOf, drivesRoutes, isExternalMember } from '@/lib/member-reach';

/**
 * What a widget REQUIRES, as data.
 *
 * ⚠️ There is no `canShow(user)` predicate here and there must never be.
 * `home-widgets.md` §2.1: *"Adding a widget is adding a row. Anyone can read
 * one file and know the whole set — that property is worth protecting more
 * than any individual feature below."* A function moves the answer out of the
 * registry and into a closure, and the first one makes the second one easy.
 *
 * ⚠️ And §2.4 rule 1 — entitlement is asked ONCE, by `availableWidgets(user)`,
 * which feeds both the home and the picker. Asked separately they drift, and
 * that rule names a real incident: the clock-in list ended up stricter than
 * the clock-in check it mirrored and hid two of three workspaces from a member
 * assigned to all three.
 */
export interface Requires {
  /**
   * An Access Profile module — the phone's own gate (`tasks`, `clock`, …).
   *
   * ⚠️ `home-widgets.md` writes `module: 'time_tracking'`, which is a PER-SPACE
   * BILLING module. The phone has never been sent those: the login payload
   * carries `enabledModules` (this) and `orgModules` (below) and no per-space
   * list at all. `clock` is time_tracking's mobile proxy and is what the four
   * hard-coded homes already gate on. Sending the per-space modules is a
   * server change, not a widget one — until then this is the honest question.
   */
  module?: MobileModule;
  /** An ORG-level feature module, off `user.orgModules`. */
  orgModule?: string;
  /** One permission, held org-wide or in any space. */
  permission?: string;
  /**
   * ANY ONE of these. An alternative to `permission`, never an addition.
   *
   * Needs-you is the first widget that needs it: it appears when the viewer
   * holds any one of four unrelated grants, and each of its rows then appears
   * independently. `anyOf` decides whether the CARD exists; each row still
   * checks its own grant. Two questions, both asked.
   */
  anyOf?: string[];
  /**
   * The permission must be held ORG-WIDE, not merely somewhere.
   * Use only where the screen behind it is `@RequirePermission` — that guard
   * reads the org resolution and a space grant does not satisfy it, however
   * senior the space role.
   */
  orgWide?: true;
  /**
   * The client book: the `crm` module runs in a workspace the member can see
   * AND their CRM view is not 'none'. Data, not a closure — the same two
   * questions the Manage row for Clients asks (`manage-rows.ts`).
   *
   * Read through `crmCapsOf` — the server's reach: org caps ∪ the crm* keys of
   * each workspace running CRM. A space-scoped sales role and an external
   * member's workspace grant both count.
   */
  crm?: true;
  /** A per-SPACE module that must run in a workspace the member can see (`moduleAnywhere`). */
  spaceModule?: string;
  /**
   * The organization's own members only. An EXTERNAL member (a client's or
   * partner's) never sees it, whatever they hold — the server's
   * `@DenyExternal` says the same about the data behind it.
   *
   * ⚠️ Only for what can never be granted to an outsider: their own clock,
   * the calendar, custody, the personnel file. Anything a workspace role can
   * grant (clients, equipment, portal requests) asks the permission instead.
   */
  internal?: true;
  /** They drive a route — `drivesRoutes` in `lib/member-reach.ts`, shared with the Plan route tile. */
  drives?: true;
  /** It is about the VIEWER. Documentation — nothing to check. */
  self?: true;
}

export function meets(user: User | null | undefined, r: Requires | undefined): boolean {
  if (!user) return false;
  if (!r) return true;
  /*
    ⚠️ `hasAccessModule`, NEVER `hasModule` — THE TAB BAR AND THE REGISTRY MUST
    ASK THE SAME QUESTION.

    `hasModule` is the raw storage reader: it answers "is this string in the
    stored array". `hasAccessModule` is the ACCESS question, and the difference
    is three rules it already implements and the other does not:

      • an ADMIN holds every module by definition, whatever is stored;
      • a user with NO Access Profile implicitly holds all of them —
        `modules.ts` says so in as many words, and null is the default;
      • `create_task` and `manage` derive from the PERMISSION, org-wide or in
        any space, because a surface withheld from somebody the server would
        accept is the bug that took the Create button off the web tasks page.

    Asking the wrong one hid the shift clock from every admin and every member
    whose profile was never configured — while `(tabs)/_layout.tsx` asked
    `hasAccessModule(user, 'clock')` and showed them the Clock TAB. The
    navigation and the home screen disagreed about the same member, which is
    exactly what §2.4 rule 1 exists to prevent: "entitlement is asked ONCE …
    asked separately they drift."
  */
  if (r.internal && isExternalMember(user)) return false;
  if (r.drives && !drivesRoutes(user)) return false;
  if (r.module && !hasAccessModule(user as never, r.module)) return false;
  if (r.spaceModule && !moduleAnywhere(user as never, r.spaceModule)) return false;
  if (r.crm && !crmCapsOf(user as never).canAccess) return false;
  if (r.orgModule && !hasFeatureModule({ orgModules: user.orgModules }, r.orgModule)) return false;
  const ask = r.orgWide ? holdsOrgWide : holds;
  if (r.permission && !ask(user as never, r.permission)) return false;
  if (r.anyOf && !r.anyOf.some((k) => ask(user as never, k))) return false;
  return true;
}
