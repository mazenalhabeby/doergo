/**
 * Who may see documents of a given TYPE.
 *
 * `canViewMemberDocuments` was one switch for the whole filing cabinet: hold it
 * and you saw every document of every type. So the clerk chasing driving
 * licences also saw the payslips, and the person filing payslips also saw the
 * disciplinary letters. There was no state between "sees nothing" and "sees
 * everything".
 *
 * A type may now name the roles that can see it. Everything below is that one
 * rule, written once, because it is asked in about ten places — every list, the
 * member's file, the folder browser, compliance, drafts, the signing chain, the
 * event log, and the minting of a download link. Ten copies of a visibility rule
 * is nine chances to leak a payslip.
 */

/** The visibility half of a document type. */
export interface TypeVisibility {
  /**
   * Roles that may see documents of this type.
   *
   * ⚠️ EMPTY MEANS NO RESTRICTION, not "nobody". It is what makes this a
   * non-event to deploy: every type that already exists keeps behaving exactly
   * as it does, and one becomes restricted only when somebody says so. The
   * opposite default is safer on paper and would empty every register in every
   * organization on the day it shipped — starting with the people whose job is
   * chasing documents.
   */
  visibleToRoleIds?: string[] | null;
}

/** What the rule needs to know about the caller. */
export interface DocumentViewer {
  /** The member's org-wide role id, or null if they hold none. */
  roleId?: string | null;
  /** An administrator sees every type — a division of labour, not a wall. */
  isAdmin?: boolean;
  /**
   * The caller's own user id, for the type CATALOGUE only.
   *
   * A restriction governs other people's documents. It must never leave a member
   * unable to see their own file or to hand in what is required of them — so the
   * catalogue keeps the types they personally need. See `visibleTypeSelfWhere`.
   */
  userId?: string | null;
}

/** Can this viewer see documents of this type? */
export function documentTypeVisibleTo(
  type: TypeVisibility | null | undefined,
  viewer: DocumentViewer,
): boolean {
  if (viewer.isAdmin) return true;
  const roles = type?.visibleToRoleIds;
  if (!roles || roles.length === 0) return true;
  return !!viewer.roleId && roles.includes(viewer.roleId);
}

/**
 * The same rule as a Prisma `where` fragment on the TYPE relation.
 *
 * Every list is already a query with a `type` relation, so the restriction
 * belongs in the query rather than in a filter afterwards. That is not only
 * faster: filtering a fetched page leaves the COUNT and the pagination
 * describing rows the reader cannot see, so a page of twenty renders as four and
 * the total lies.
 *
 * Returns `undefined` for a viewer who is not restricted at all, so the caller
 * spreads it and adds nothing to the query in the common case.
 */
export function visibleTypeWhere(
  viewer: DocumentViewer,
): { type: object } | { OR: object[] } | undefined {
  if (viewer.isAdmin) return undefined;

  const byType = {
    type: {
      OR: [
        // Unrestricted — the default, and the majority.
        { visibleToRoleIds: { isEmpty: true } },
        // …or it names this role. A viewer with no role matches only the first,
        // which is correct: they were never granted a restricted type.
        ...(viewer.roleId ? [{ visibleToRoleIds: { has: viewer.roleId } }] : []),
      ],
    },
  };

  /*
    A restriction never hides a document from the person it is about.

    It governs whose OTHER documents you may read. Left out, restricting a type
    would take a member's own payslip out of the register they are looking at,
    and the tab counts around it would disagree with the rows — the subject is
    the one reader who is never the audience for this rule.
  */
  if (!viewer.userId) return byType;
  return { OR: [byType, { userId: viewer.userId }] };
}

/**
 * The same rule for a query over the TYPES themselves — the filter list, the
 * requirements screen, anywhere a type is offered rather than a document.
 *
 * Kept beside its sibling so the two cannot answer differently: a type missing
 * from a filter list while its documents are still listed is the bug this file
 * exists to prevent.
 */
export function visibleTypeSelfWhere(viewer: DocumentViewer): object | undefined {
  if (viewer.isAdmin) return undefined;
  return {
    OR: [
      { visibleToRoleIds: { isEmpty: true } },
      ...(viewer.roleId ? [{ visibleToRoleIds: { has: viewer.roleId } }] : []),

      /*
        …and everything this person needs for their OWN file.

        Without these three, restricting a type would quietly break the member it
        applies to: the tab holding their own document would vanish, the upload
        button for a document still required of them would disappear, and the
        requirement would go on being chased by a screen that no longer offered
        any way to satisfy it.

        Nothing here reveals another person's document. A type they already hold
        one of, or are being asked to provide, is a type they know about — the
        restriction is on the filing cabinet, not on the labels of their own
        folders. Written as clauses in the same query so the catalogue cannot
        disagree with itself depending on which screen asked.
      */
      ...(viewer.userId
        ? [
            { documents: { some: { userId: viewer.userId } } },
            { requiredFromAll: true },
            ...(viewer.roleId ? [{ requiredFromRoleIds: { has: viewer.roleId } }] : []),
          ]
        : []),
    ],
  };
}
