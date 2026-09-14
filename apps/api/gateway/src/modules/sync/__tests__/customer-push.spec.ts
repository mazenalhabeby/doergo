/**
 * A portal client may push their queued request — and nothing else opens up.
 */
import { IS_CUSTOMER_ALLOWED_KEY } from '@hbcfield/shared';
import { SyncController } from '../sync.controller';
import { PortalController } from '../../portal/portal.controller';

const allowed = (fn: object) => Reflect.getMetadata(IS_CUSTOMER_ALLOWED_KEY, fn) === true;

describe('customer portal and offline sync', () => {
  it('lets a customer push, and only push', () => {
    expect(allowed(SyncController.prototype.push)).toBe(true);
    expect(allowed(SyncController.prototype.pull)).toBe(false);
    expect(allowed(SyncController.prototype.telemetry)).toBe(false);
    expect(allowed(SyncController.prototype.mediaLinks)).toBe(false);
    expect(allowed(SyncController.prototype.memberHealth)).toBe(false);
    // Not at class level either, or every sync route would open to customers.
    expect(Reflect.getMetadata(IS_CUSTOMER_ALLOWED_KEY, SyncController)).toBeUndefined();
  });

  it('a request sent again from the phone creates the same task, named by the phone', async () => {
    const created: any[] = [];
    const controller = Object.create(PortalController.prototype) as any;
    controller.authClient = { send: () => ({ subscribe: (o: any) => { o.next({ categories: [{ key: 'leak', label: 'Leak', isActive: true }] }); o.complete(); } }) };
    controller.tasksQueue = { createTask: async (d: any) => (created.push(d), { id: d.id }) };
    const req = { user: { id: 'cust-user', customerId: 'cust-1', organizationId: 'org-1' } };
    await controller.submitRequest({ id: '0192b3c4-0000-7000-8000-000000000001', categoryKey: 'leak' }, req);
    expect(created[0]).toMatchObject({ id: '0192b3c4-0000-7000-8000-000000000001', customerId: 'cust-1', userId: 'cust-user' });
  });
});
