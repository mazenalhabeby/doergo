import {
  documentTypeVisibleTo,
  visibleTypeWhere,
  visibleTypeSelfWhere,
} from '@hbcfield/shared';

/**
 * Who may see documents of a given TYPE.
 *
 * `canViewMemberDocuments` was one switch for the whole filing cabinet: hold it
 * and you saw payslips, passports and disciplinary letters alike. A type may now
 * name the roles that see it, and this suite holds the three shapes of that one
 * rule still — the predicate, the `where` on documents, and the `where` on the
 * type catalogue. They are asked in about ten places; if they can disagree, one
 * of those places leaks a payslip.
 */
describe('document type visibility', () => {
  const HR = 'role_hr';
  const DOCS = 'role_docs';

  describe('the predicate', () => {
    it('lets an unrestricted type through — the default, and every type that exists today', () => {
      expect(documentTypeVisibleTo({ visibleToRoleIds: [] }, { roleId: DOCS })).toBe(true);
      expect(documentTypeVisibleTo({ visibleToRoleIds: null }, { roleId: DOCS })).toBe(true);
      expect(documentTypeVisibleTo({}, { roleId: null })).toBe(true);
      // A type row that failed to load is not a reason to hide a document that
      // nobody restricted.
      expect(documentTypeVisibleTo(null, { roleId: null })).toBe(true);
    });

    it('refuses a restricted type to a role that is not named', () => {
      expect(documentTypeVisibleTo({ visibleToRoleIds: [HR] }, { roleId: DOCS })).toBe(false);
      expect(documentTypeVisibleTo({ visibleToRoleIds: [HR] }, { roleId: null })).toBe(false);
    });

    it('allows a role that is named', () => {
      expect(documentTypeVisibleTo({ visibleToRoleIds: [HR, DOCS] }, { roleId: DOCS })).toBe(true);
    });

    it('never restricts an administrator — this is a division of labour, not a wall', () => {
      expect(documentTypeVisibleTo({ visibleToRoleIds: [HR] }, { roleId: DOCS, isAdmin: true })).toBe(true);
      expect(documentTypeVisibleTo({ visibleToRoleIds: [HR] }, { roleId: null, isAdmin: true })).toBe(true);
    });
  });

  describe('the where on documents', () => {
    it('adds nothing at all for an administrator, so the common query is untouched', () => {
      expect(visibleTypeWhere({ roleId: HR, isAdmin: true })).toBeUndefined();
    });

    it('always admits the unrestricted types', () => {
      const where = visibleTypeWhere({ roleId: null }) as { type: { OR: unknown[] } };
      expect(where.type.OR).toEqual([{ visibleToRoleIds: { isEmpty: true } }]);
    });

    it('admits a named role as well, and only when there is one', () => {
      const where = visibleTypeWhere({ roleId: DOCS }) as { type: { OR: unknown[] } };
      expect(where.type.OR).toContainEqual({ visibleToRoleIds: { has: DOCS } });
      expect(where.type.OR).toHaveLength(2);
    });
  });

  describe('the where on the type catalogue', () => {
    /*
      The catalogue carries three extra clauses the document query must NOT have.
      A restriction governs other people's documents; it must never leave a member
      unable to see their own file or to hand in what is required of them.
    */
    it('keeps the types the member already holds a document of', () => {
      const where = visibleTypeSelfWhere({ roleId: DOCS, userId: 'u1' }) as { OR: unknown[] };
      expect(where.OR).toContainEqual({ documents: { some: { userId: 'u1' } } });
    });

    it('keeps the types still required of them, by everyone or by their role', () => {
      const where = visibleTypeSelfWhere({ roleId: DOCS, userId: 'u1' }) as { OR: unknown[] };
      expect(where.OR).toContainEqual({ requiredFromAll: true });
      expect(where.OR).toContainEqual({ requiredFromRoleIds: { has: DOCS } });
    });

    it('adds none of those when no user is given — the catalogue is then the register’s', () => {
      const where = visibleTypeSelfWhere({ roleId: DOCS }) as { OR: unknown[] };
      expect(where.OR).toHaveLength(2);
    });

    it('still adds nothing for an administrator', () => {
      expect(visibleTypeSelfWhere({ roleId: HR, isAdmin: true, userId: 'u1' })).toBeUndefined();
    });
  });
});
