/**
 * The registers: the folder tree, the issued register, one member's file, and a
 * document's evidence trail.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
/** What a register row shows of a document — `type` is chosen per register. */
const REGISTER_ROW_SELECT = {
  id: true,
  title: true,
  status: true,
  periodYear: true,
  periodMonth: true,
  issuedAt: true,
  firstOpenedAt: true,
  expiresOn: true,
  sizeBytes: true,
  mimeType: true,
  hiddenFromMember: true,
  rolesOverridden: true,
  visibleToRoleIds: true,
  _count: { select: { signatures: true } },
  user: { select: { id: true, firstName: true, lastName: true } },
  signatures: {
    select: { signedAt: true },
    orderBy: { signedAt: 'desc' as const },
    take: 1,
  },
} as const;

/** The fields every row of a member's document list carries, theirs or waiting on them. */
function listRow(d: {
  id: string; title: string; typeId: string; type: { key: string; label: string };
  periodYear: number | null; periodMonth: number | null; status: string;
  sizeBytes: number | null; mimeType: string | null; issuedAt: Date | null;
  expiresOn: Date | null; firstOpenedAt: Date | null;
}) {
  return {
    id: d.id,
    title: d.title,
    typeId: d.typeId,
    typeKey: d.type.key,
    typeLabel: d.type.label,
    periodYear: d.periodYear,
    periodMonth: d.periodMonth,
    status: d.status,
    sizeBytes: d.sizeBytes,
    mimeType: d.mimeType,
    issuedAt: d.issuedAt,
    expiresOn: d.expiresOn,
    unread: d.firstOpenedAt === null,
  };
}

export { REGISTER_ROW_SELECT, listRow };
