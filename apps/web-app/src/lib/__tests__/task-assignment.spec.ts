import type { Task } from '@/lib/api'

import { assigneeIds, isAssignedTo } from '../task-assignment'

/**
 * A task carries its assignment twice — `assignedToId` (lead) and `assignees[]`
 * (co-assignees) — and the API returns a member's tasks using BOTH. Reading only
 * the first is what hid co-assigned work from My Tasks, from the 'own' space
 * scope, and from every space card's "current task".
 */

const task = (over: Partial<Task> = {}): Task => ({ id: 't1', title: 'T', ...over }) as Task

describe('isAssignedTo', () => {
  it('matches the lead assignee', () => {
    expect(isAssignedTo(task({ assignedToId: 'u1' }), 'u1')).toBe(true)
  })

  it('matches a co-assignee — the case that was being dropped', () => {
    const t = task({ assignedToId: 'u9', assignees: [{ userId: 'u1' }] as never })
    expect(isAssignedTo(t, 'u1')).toBe(true)
  })

  it('matches a co-assignee identified only by its nested user', () => {
    const t = task({ assignees: [{ user: { id: 'u1' } }] as never })
    expect(isAssignedTo(t, 'u1')).toBe(true)
  })

  it('does not match an unrelated user', () => {
    const t = task({ assignedToId: 'u9', assignees: [{ userId: 'u8' }] as never })
    expect(isAssignedTo(t, 'u1')).toBe(false)
  })

  it('is false for an unassigned task', () => {
    expect(isAssignedTo(task(), 'u1')).toBe(false)
  })

  it('is false when the user id is missing, rather than matching a null lead', () => {
    expect(isAssignedTo(task({ assignedToId: null } as never), undefined)).toBe(false)
    expect(isAssignedTo(task({ assignedToId: null } as never), null)).toBe(false)
  })
})

describe('assigneeIds', () => {
  it('returns the lead and every co-assignee', () => {
    const t = task({ assignedToId: 'lead', assignees: [{ userId: 'a' }, { userId: 'b' }] as never })
    expect(assigneeIds(t).sort()).toEqual(['a', 'b', 'lead'])
  })

  it('de-duplicates a lead who is also listed as a co-assignee', () => {
    const t = task({ assignedToId: 'u1', assignees: [{ userId: 'u1' }] as never })
    expect(assigneeIds(t)).toEqual(['u1'])
  })

  it('is empty for an unassigned task', () => {
    expect(assigneeIds(task())).toEqual([])
  })

  it('skips entries carrying no id at all', () => {
    const t = task({ assignees: [{}, { userId: 'a' }] as never })
    expect(assigneeIds(t)).toEqual(['a'])
  })
})
