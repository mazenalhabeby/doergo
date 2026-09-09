import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Who a task is assigned TO, when the assignees live in their own table.
 *
 * A task carries both: the legacy `assignedToId` column and `TaskAssignee` rows.
 * `syncPrimaryAssignee` is the one place that keeps them agreeing, and it used
 * to look for a LEAD and nothing else — while `MEMBER` is the DEFAULT role, in
 * the column default and in `addAssignee`.
 *
 * So assigning one person through the picker found no LEAD and wrote
 * `assignedToId = null`. The task had somebody on it and read as assigned to
 * nobody: the web showed the assignee (it reads the rows), the phone showed
 * none (it reads the column), and six tasks in a small dev database were already
 * in that state.
 *
 * Reads were never the problem — the list matches on
 * `assignedToId OR assignees.some`, so the work still appeared. What broke was
 * every display of WHO.
 */
describe('the primary assignee follows the assignee rows', () => {
  const SRC = readFileSync(join(__dirname, '..', 'tasks.service.ts'), 'utf8');
  const fn = (() => {
    const start = SRC.indexOf('private async syncPrimaryAssignee(');
    expect(start).toBeGreaterThan(-1);
    const rest = SRC.slice(start);
    return rest.slice(0, rest.indexOf('\n  }') + 4);
  })();

  it('prefers a LEAD when one is named', () => {
    expect(fn).toContain("role: 'LEAD'");
  });

  /*
    THE regression. Without a fallback, one MEMBER assignee — the default, and
    the ordinary case — means the task is assigned to nobody.
  */
  it('falls back to an assignee when no LEAD is named', () => {
    const afterLead = fn.slice(fn.indexOf("role: 'LEAD'"));
    expect(afterLead).toMatch(/taskAssignee\.findFirst/);
    expect(afterLead).toContain('orderBy');
  });

  it('takes the EARLIEST assignee, so it does not move under somebody', () => {
    // Adding a colleague later must not silently reassign the task to them.
    expect(fn).toMatch(/orderBy:\s*\{\s*createdAt:\s*'asc'\s*\}/);
  });

  it('clears the column only when there is nobody on the task at all', () => {
    expect(fn).toMatch(/assignedToId:\s*primary\?\.userId\s*\?\?\s*null/);
  });
});

/**
 * And the status that follows from it.
 *
 * `assign()` has always set ASSIGNED; `addAssignee` did not — so a task could
 * carry an assignee and sit at NEW, and NEW offers the assignee nothing to
 * press, because Accept appears at ASSIGNED. Together with the bug above, a task
 * assigned on the web could not be worked on at all.
 */
describe('one writer owns what an assignment implies', () => {
  const SRC = readFileSync(join(__dirname, '..', 'tasks.service.ts'), 'utf8');
  const writer = (() => {
    const start = SRC.indexOf('private async afterAssigneesChanged(');
    expect(start).toBeGreaterThan(-1);
    const rest = SRC.slice(start);
    return rest.slice(0, rest.indexOf('\n  }\n') + 4);
  })();

  it('moves the task out of NEW when somebody is put on it', () => {
    expect(writer).toMatch(/status:\s*TaskStatus\.NEW/);
    expect(writer).toMatch(/status:\s*TaskStatus\.ASSIGNED/);
  });

  /*
    Only NEW moves. Anything already under way is somebody's live state, and a
    workflow with its own statuses is left alone — WorkflowStatus has no flag
    saying which of ITS steps means "has an owner", so advancing one would be a
    guess that moves somebody's board card under them.
  */
  it('touches only NEW, never a task already under way', () => {
    expect(writer).toMatch(/updateMany\(\{[\s\S]*?status:\s*TaskStatus\.NEW/);
  });

  /*
    `addAssignee` emitted `task_updated` — which tells people already watching
    the task that it changed — and never `task_assigned`, which is what reaches
    the person the work was given to. Being added through the picker was silent.
  */
  it('tells the person they have been given work', () => {
    expect(writer).toContain("emit('task_assigned'");
  });

  it('says nothing when nobody was newly assigned', () => {
    expect(writer).toMatch(/newlyAssigned\.length === 0\)\s*return/);
  });

  /*
    All three mutation paths end here. That is the point: they used to decide
    for themselves what an assignment implied, and three of the four were wrong
    in a different way.
  */
  it('is the only place any of them decides', () => {
    for (const caller of ['async assign(', 'async addAssignee(', 'async removeAssignee(']) {
      const start = SRC.indexOf(caller);
      expect(start).toBeGreaterThan(-1);
      const body = SRC.slice(start, SRC.indexOf('\n  async ', start + 10));
      expect(body).toContain('afterAssigneesChanged(');
    }
  });
});

/**
 * The read side, asserted so a future change cannot quietly narrow it.
 *
 * A member must find their work whether they were named through the legacy
 * column or added as a row. This was already right and is the reason the bug
 * above cost visibility of WHO rather than the task itself.
 */
describe('a member sees work assigned either way', () => {
  const SRC = readFileSync(join(__dirname, '..', 'tasks.service.ts'), 'utf8');

  it('matches on the column OR an assignee row', () => {
    expect(SRC).toContain('{ OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }] }');
  });
});
