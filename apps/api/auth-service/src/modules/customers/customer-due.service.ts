import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CRM_COLD_DAYS, CRM_CONTACT_TYPES, toISODateString } from '@hbcfield/shared';
import { crmReachOrgOnly, crmCapsAnywhere, NO_CRM_CAPS } from '@hbcfield/shared';
import { ownedBy, CrmCaller, DUE_ROWS, reachSql } from './customers-helpers';
import { CustomersServiceBase } from './customers-service.base';

/** The home Clients card: reminders owed today, clients going cold, the book's size. */
@Injectable()
export class CustomerDueService extends CustomersServiceBase {
  /**
   * ⭐ WHAT IS OWED TODAY — the home screen's Clients card (docs/design/clients).
   *
   * One read across the whole book, where every other CRM read is per client:
   * answering "who am I owed a call by" with `/customers/:id/activities` is one
   * request per client, 214 of them for a real book.
   *
   * A reminder is MINE when it is assigned to me, or — assigned to nobody —
   * when I own or co-manage the client (every manager gets it, which is why
   * the row carries `shared`), or when I wrote it on a client nobody manages.
   * A view-all role does NOT get every rep's reminders: the card is what YOU
   * owe, not the organization's to-do list.
   *
   * ⚠️ Contacts and portal residents are not clients (CLAUDE.md, CRM contact
   * people) — neither owes anybody a call, and neither counts in the book.
   *
   * ⚠️ `dayStart`/`dayEnd` come from the PHONE: "today" is the member's day,
   * and the server does not know which timezone they are standing in. Bounded
   * so a caller cannot widen the window into a full dump.
   */
  async due(data: {
    organizationId: string;
    caller?: CrmCaller;
    crmOn?: boolean;
    dayStart?: string;
    dayEnd?: string;
    limit?: number;
  }) {
    const me = data.caller?.userId;
    const counts = { call: 0, email: 0, other: 0, overdue: 0 };
    // `crmOn === false` only: an older gateway sends nothing and keeps today's answer.
    const reach =
      data.crmOn === false ? crmReachOrgOnly(NO_CRM_CAPS) : await this.crmReachFor(data.caller, data.organizationId);
    if (!crmCapsAnywhere(reach).canAccess || !me)
      return {
        data: {
          allowed: false,
          items: [],
          total: 0,
          counts,
          cold: { count: 0, days: CRM_COLD_DAYS, longest: null },
          book: 0,
        },
      };

    const now = Date.now();
    const DAY = 86_400_000;
    const parse = (v: string | undefined, fallback: number) => {
      const t = v ? Date.parse(v) : NaN;
      return Number.isFinite(t) && Math.abs(t - now) <= 2 * DAY ? t : fallback;
    };
    const utcStart = new Date(toISODateString(new Date(now))).getTime();
    /*
      ⚠️ The two ends are checked TOGETHER. Each alone within two days of now
      still let a reversed window through (overdue counted against the later
      end) or a four-day one (tomorrow's reminders read as today's, and nothing
      read as late). A day is at most 25 hours (DST); anything that is not one
      falls back to the UTC day rather than answering a different question.
    */
    let start = parse(data.dayStart, NaN);
    let end = parse(data.dayEnd, NaN);
    if (!(Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 26 * 3_600_000)) {
      start = utcStart;
      end = utcStart + DAY;
    }
    const dayStart = new Date(start);
    const dayEnd = new Date(end);
    const asked = Number(data.limit);
    const limit = Number.isFinite(asked) ? Math.min(Math.max(Math.floor(asked), 1), 20) : 5;

    const book: Record<string, unknown> = {
      organizationId: data.organizationId,
      isActive: true,
      isContact: false,
      isPortalResident: false,
      // The book the member can reach — org-wide, and the workspaces they hold CRM in.
      ...this.reachableWhere(reach, data.caller),
    };

    const dueWhere = {
      organizationId: data.organizationId,
      type: 'REMINDER',
      doneAt: null,
      dueAt: { lt: dayEnd },
      AND: [
        { customer: book },
        {
          OR: [
            { reminderAssigneeId: me },
            { reminderAssigneeId: null, customer: ownedBy(me) },
            { reminderAssigneeId: null, authorId: me, customer: { ownerId: null, managerIds: { isEmpty: true } } },
          ],
        },
      ],
    } as never as Record<string, unknown>;
    const rows = await this.prisma.customerActivity.findMany({
      where: dueWhere as never,
      orderBy: { dueAt: 'asc' },
      // Bounded: the card shows a handful and counts the rest (see the total below).
      take: DUE_ROWS,
      select: {
        id: true,
        customerId: true,
        body: true,
        dueAt: true,
        reminderKind: true,
        reminderAssigneeId: true,
        customer: { select: { name: true, type: true, phone: true, email: true, ownerId: true, managerIds: true } },
      },
    });

    const items = rows.map((r) => {
      // MEETING is not a reason a reminder can have (shared/crm/reminder.ts) — an old one reads as OTHER.
      const kind = r.reminderKind === 'CALL' || r.reminderKind === 'EMAIL' ? r.reminderKind : 'OTHER';
      const managers = new Set([r.customer.ownerId, ...(r.customer.managerIds ?? [])].filter(Boolean) as string[]);
      if (kind === 'CALL') counts.call++;
      else if (kind === 'EMAIL') counts.email++;
      else counts.other++;
      if (r.dueAt && r.dueAt < dayStart) counts.overdue++;
      return {
        id: r.id,
        customerId: r.customerId,
        name: r.customer.name,
        type: r.customer.type,
        kind,
        note: r.body ?? null,
        dueAt: r.dueAt,
        // Everybody who manages this client has this row; one call clears all of them.
        shared: !r.reminderAssigneeId && managers.size > 1 ? managers.size : 0,
        phone: kind === 'CALL' ? (r.customer.phone ?? null) : null,
        email: kind === 'EMAIL' ? (r.customer.email ?? null) : null,
      };
    });

    /*
      Going cold: in the book for CRM_COLD_DAYS with nothing logged on it since.
      The answer carries the rule it used and the client who has waited
      longest, so the card states facts rather than a sentence of its own.
    */
    const cutoff = new Date(now - CRM_COLD_DAYS * DAY);
    const coldWhere = {
      ...book,
      createdAt: { lt: cutoff },
      activities: { none: { type: { in: [...CRM_CONTACT_TYPES] }, createdAt: { gte: cutoff } } },
    } as never;
    const [coldCount, total, longestRows] = await Promise.all([
      this.prisma.customer.count({ where: coldWhere }),
      this.prisma.customer.count({ where: book as never }),
      /*
        ⚠️ The longest-waiting client, answered by the DATABASE over the whole
        book. It used to be searched among the 200 oldest-created cold clients,
        so in a big book the one who had truly waited longest (created later,
        last called long ago) was simply never looked at. One grouped query:
        each cold client's last contact, the oldest first, one row back.
      */
      this.prisma.$queryRaw<Array<{ id: string; name: string; since: Date; last: Date | null }>>(Prisma.sql`
        SELECT c.id, c.name,
               COALESCE(MAX(a."createdAt"), c."createdAt") AS since,
               MAX(a."createdAt") AS last
        FROM customers c
        LEFT JOIN customer_activities a
               ON a."customerId" = c.id AND a.type::text = ANY(${[...CRM_CONTACT_TYPES]}::text[])
        WHERE c."organizationId" = ${data.organizationId}
          AND c."isActive" AND NOT c."isContact" AND NOT c."isPortalResident"
          AND c."createdAt" < ${cutoff}
          ${reachSql(reach, me)}
        GROUP BY c.id
        HAVING COALESCE(MAX(a."createdAt"), '-infinity'::timestamp) < ${cutoff}
        ORDER BY since ASC
        LIMIT 1`),
    ]);
    const top = longestRows[0];
    const longest = top
      ? { id: top.id, name: top.name, days: Math.floor((now - new Date(top.since).getTime()) / DAY), never: !top.last }
      : null;
    const cold = { count: coldCount, days: CRM_COLD_DAYS, longest };

    /*
      ⚠️ More than the rows read: count on the database. The card's total and
      the per-kind counts came from the 200 rows fetched, so a member with more
      open reminders was told 200. Only asked when the cap was actually hit.
    */
    let dueTotal = items.length;
    if (rows.length === DUE_ROWS) {
      const [byKind, overdue] = await Promise.all([
        this.prisma.customerActivity.groupBy({
          by: ['reminderKind'],
          where: dueWhere as never,
          _count: { _all: true },
        }),
        this.prisma.customerActivity.count({ where: { ...dueWhere, dueAt: { lt: dayStart } } as never }),
      ]);
      counts.call = counts.email = counts.other = 0;
      for (const g of byKind) {
        const k = g.reminderKind === 'CALL' ? 'call' : g.reminderKind === 'EMAIL' ? 'email' : 'other';
        counts[k] += (g._count as { _all?: number } | undefined)?._all ?? 0;
      }
      counts.overdue = overdue;
      dueTotal = counts.call + counts.email + counts.other;
    }

    return { data: { allowed: true, items: items.slice(0, limit), total: dueTotal, counts, cold, book: total } };
  }
}
