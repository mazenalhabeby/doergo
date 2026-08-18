import { dashboardVariant } from '../dashboard-skeleton'

/**
 * One decision, shared by the page and its skeleton, so the placeholder can
 * never draw a different layout than the screen that replaces it.
 */
describe('dashboardVariant', () => {
  const profile = (spaceScope: string) => ({ enabledModules: { spaceScope } })

  it('gives admins the space grid', () => {
    expect(dashboardVariant({ role: 'ADMIN' })).toBe('spaces')
  })

  it('gives managers the space grid — canViewAllTasks, not the role, is the test', () => {
    expect(dashboardVariant({ role: 'EMPLOYEE', canViewAllTasks: true })).toBe('spaces')
  })

  it('gives a task-only member the narrow single column', () => {
    expect(dashboardVariant({ role: 'EMPLOYEE', ...profile('tasks') })).toBe('tasks')
  })

  it('gives a member with spaces the two-column layout', () => {
    expect(dashboardVariant({ role: 'EMPLOYEE', ...profile('own') })).toBe('employee')
    expect(dashboardVariant({ role: 'EMPLOYEE', ...profile('all') })).toBe('employee')
  })

  it('defaults an unknown profile to the space layout, matching getSpaceScope', () => {
    expect(dashboardVariant({ role: 'EMPLOYEE' })).toBe('employee')
  })

  it('falls back to the admin grid while auth is still resolving', () => {
    expect(dashboardVariant(null)).toBe('spaces')
    expect(dashboardVariant(undefined)).toBe('spaces')
  })

  it('does not let a task-only scope override an admin', () => {
    expect(dashboardVariant({ role: 'ADMIN', ...profile('tasks') })).toBe('spaces')
  })
})
