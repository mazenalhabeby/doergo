import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every query that reads documents must answer the visibility question.
 *
 * The restriction is only as good as its least-scoped query: one list that
 * forgets it shows a colleague's payslip, and neither a type checker nor a code
 * review reliably catches an omitted `where` clause. So this reads the service
 * and insists — a list added next year fails here until it has decided, rather
 * than defaulting to showing everything.
 *
 * The exemptions are named with the reason each is safe. Adding to that list is
 * a deliberate act; forgetting the scope is not.
 */
describe('every document read is scoped by type visibility', () => {
  const SRC = readFileSync(join(__dirname, '..', 'documents.service.ts'), 'utf8');

  /**
   * Reads that are safe without the type scope, and why.
   *
   * Every one is confined to the caller's own documents, or to a document they
   * were personally routed onto — the two relationships this restriction is not
   * about.
   */
  const EXEMPT: Record<string, string> = {
    submitOwnDocument: 'the caller filing into their own file',
    listRequirements: 'what is required OF the caller',
    pendingForMember: 'the caller’s own outstanding documents',
    documentsWaitingOnMe: 'documents this caller was routed onto to sign',
    deleteOwnSupplied: 'the caller withdrawing something they supplied',
    signBatchAsCustomer: 'a customer signing through an emailed link — no member role at all',
    findSignableOr404:
      'the signing door: the turn was checked above, or the caller must be the subject',
    checkSubmittedScan:
      'a member submitting their OWN scan — the duplicate-number check must see every ' +
      'member’s numbers or it stops catching the thing it exists for, and it returns a ' +
      'name rather than a document',
  };

  const ASSERTS = /assertTypeVisible\(/;
  const SCOPES = /typeScope\(/;

  it('scopes, asserts, or is a named exemption — no fourth option', () => {
    const lines = SRC.split('\n');

    // Method boundaries: two-space indentation is a class member in this file.
    const starts: { name: string; line: number }[] = [];
    lines.forEach((l, i) => {
      const m = /^  (?:private |public )?(?:async )?(\w+)\(/.exec(l);
      if (m && !l.trim().startsWith('//') && !l.trim().startsWith('*')) {
        starts.push({ name: m[1], line: i });
      }
    });

    const methodAt = (line: number) => {
      let found: { name: string; line: number } | undefined;
      for (const s of starts) {
        if (s.line <= line) found = s;
        else break;
      }
      return found;
    };
    const bodyOf = (name: string) => {
      const idx = starts.findIndex((s) => s.name === name);
      const end = idx + 1 < starts.length ? starts[idx + 1].line : lines.length;
      return lines.slice(starts[idx].line, end).join('\n');
    };

    const unscoped: string[] = [];
    lines.forEach((l, i) => {
      if (!/prisma\.document\.(findMany|findFirst|count|groupBy|aggregate)/.test(l)) return;
      const method = methodAt(i);
      if (!method || EXEMPT[method.name]) return;
      const body = bodyOf(method.name);
      if (SCOPES.test(body) || ASSERTS.test(body)) return;
      unscoped.push(`${method.name} (line ${i + 1})`);
    });

    expect(unscoped).toEqual([]);
  });

  it('scopes the issued register on the BASE, so the tab counts agree with the rows', () => {
    // A filter applied to the rows but not the counts leaves the tabs counting
    // documents the reader cannot open — a restriction that announces what it
    // hides. This was the actual bug: `base` was built without it.
    const base = SRC.slice(SRC.indexOf('const base: Prisma.DocumentWhereInput = {'));
    expect(base.slice(0, base.indexOf('};'))).toContain('typeScope(data.actor)');
  });

  it('exempts a routed signer at the download door, not before it', () => {
    // `assertTypeVisible` runs AFTER `isSigner` is known: a shift leader
    // countersigning a time sheet is not in HR, and being asked to sign is the
    // authorisation to read that one document.
    const fn = SRC.slice(SRC.indexOf('async getDownloadUrl('));
    expect(fn.indexOf('const isSigner =')).toBeLessThan(fn.indexOf('assertTypeVisible('));
  });
});
