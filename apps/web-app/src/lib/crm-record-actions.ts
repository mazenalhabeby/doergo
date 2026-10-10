/**
 * What a member may DO on one client record — the server's own rules, read from
 * the caps it sends with the record (`GET /customers/:id` → `crmCaps`).
 *
 * Mirrors `CustomersService.update` / `assertCrmReach` in auth-service:
 *
 *   • a client with app access (portal resident) is a manager surface — every
 *     change on it needs `manage`;
 *   • the stage needs `work` (or `manage`);
 *   • the record's info needs `editInfo` (or `manage`);
 *   • notes, calls and reminders need `work` (or `manage`);
 *   • who manages the client (owner / managers) is `manage`;
 *   • inviting them to the app is `@RequirePermission('crmManageClients')`,
 *     which `manage` resolves from.
 *
 * The server stays the authority: this only stops offering a button whose only
 * outcome is a refusal.
 */
interface RecordCrmCaps {
  work?: boolean
  editInfo?: boolean
  manage?: boolean
}

interface ClientRecordActions {
  editInfo: boolean
  setStage: boolean
  /** The composer, the quick reminder and the timeline's done/snooze/delete. */
  work: boolean
  assignManagers: boolean
  invite: boolean
}

export function clientRecordActions(
  caps: RecordCrmCaps | null | undefined,
  isPortalResident: boolean | null | undefined,
): ClientRecordActions {
  const manage = caps?.manage === true
  if (isPortalResident) {
    return { editInfo: manage, setStage: manage, work: manage, assignManagers: manage, invite: manage }
  }
  const work = caps?.work === true || manage
  return {
    editInfo: caps?.editInfo === true || manage,
    setStage: work,
    work,
    assignManagers: manage,
    invite: manage,
  }
}
