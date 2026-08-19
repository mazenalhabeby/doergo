import { fromDeclaredPath } from '../audit.interceptor';

/**
 * What the audit log calls a thing.
 *
 * The event type used to be inferred from the URL, and the inference could not
 * tell an identifier from a resource name unless the identifier was a cuid, a
 * uuid or long hex. Anything else became the resource: removing an assignee
 * wrote `EMP-DANA_DELETED` and the reader saw "John Owner Emp-dana Deleted".
 * Reading the declared route removes the guess entirely.
 */
describe('fromDeclaredPath', () => {
  it('names the sub-resource, not the identifier that follows it', () => {
    const r = fromDeclaredPath(
      '/tasks/:id/assignees/:userId',
      '/api/v1/tasks/cmrtizayz00btsbdfhkxctsfy/assignees/emp-dana',
    );
    expect(r.resourceType).toBe('assignees');
    expect(r.normalized).toBe('/tasks/:id/assignees/:id');
  });

  it('attributes the event to the first identifier — the record it is about', () => {
    const r = fromDeclaredPath(
      '/tasks/:id/assignees/:userId',
      '/api/v1/tasks/cmrtizayz00btsbdfhkxctsfy/assignees/emp-dana',
    );
    // The task, not the person removed from it.
    expect(r.resourceId).toBe('cmrtizayz00btsbdfhkxctsfy');
  });

  it('handles an identifier that looks nothing like a cuid', () => {
    // The whole point: a numeric, slug or username id is still an id.
    for (const id of ['42', 'emp-manager', 'a.holub', 'ABC_123']) {
      const r = fromDeclaredPath('/members/:id', `/api/v1/members/${id}`);
      expect(r.resourceType).toBe('members');
      expect(r.resourceId).toBe(id);
      expect(r.normalized).toBe('/members/:id');
    }
  });

  it('normalizes to a stable key so curated action names match', () => {
    const a = fromDeclaredPath('/organizations/members/:id', '/api/v1/organizations/members/emp-dana');
    const b = fromDeclaredPath('/organizations/members/:id', '/api/v1/organizations/members/cmxyz00000000000000000000');
    // Two different members, one route — one event type, not two.
    expect(a.normalized).toBe(b.normalized);
    expect(a.normalized).toBe('/organizations/members/:id');
  });

  it('keeps a collection route as a collection', () => {
    const r = fromDeclaredPath('/tasks', '/api/v1/tasks');
    expect(r.resourceType).toBe('tasks');
    expect(r.resourceId).toBeUndefined();
    expect(r.normalized).toBe('/tasks');
  });

  it('reads a two-word collection as one resource', () => {
    // /organizations/members is collection + sub-collection, no id between —
    // the shape that defeats any positional rule.
    const r = fromDeclaredPath('/organizations/members', '/api/v1/organizations/members');
    expect(r.resourceType).toBe('members');
    expect(r.resourceId).toBeUndefined();
  });

  it('names the action segment when the route ends in one', () => {
    const r = fromDeclaredPath('/join-requests/:id/approve', '/api/v1/join-requests/jr-7/approve');
    expect(r.resourceType).toBe('approve');
    expect(r.resourceId).toBe('jr-7');
    expect(r.normalized).toBe('/join-requests/:id/approve');
  });

  it('survives a URL shorter than the declared route', () => {
    const r = fromDeclaredPath('/tasks/:id', '/api/v1/tasks');
    expect(r.resourceId).toBeUndefined();
    expect(r.normalized).toBe('/tasks/:id');
  });
});
