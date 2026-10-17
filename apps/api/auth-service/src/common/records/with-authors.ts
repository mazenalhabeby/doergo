import type { PrismaService } from '../prisma/prisma.service';

/**
 * Timeline rows with their author's name — one query for all authors, whatever
 * the number of rows. A row with no author (or an author since removed) gets null.
 */
export async function withAuthors<R extends { authorId: string | null }>(prisma: PrismaService, rows: R[]) {
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean) as string[])];
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const byId = new Map(authors.map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, author: r.authorId ? (byId.get(r.authorId) ?? null) : null }));
}
