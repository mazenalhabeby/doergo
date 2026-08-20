import { ForbiddenException } from '@nestjs/common';
import { AssetsService } from '../assets.service';

/**
 * The two rules that were spread across 25 copies and one missing clamp.
 *
 * Reached through the class rather than reimplemented here — a test that
 * rewrites the rule it is testing passes whatever the code does.
 */
describe('assets service guards', () => {
  // Only the guards are exercised; nothing here touches the database.
  const svc = new AssetsService({} as never);
  const may = (actor: unknown) => (svc as any).assertMay(actor, 'do the thing');
  const page = (limit: unknown, fallback?: number) => (svc as any).pageSize(limit, fallback);

  describe('who may act', () => {
    it('lets an admin through', () => {
      expect(() => may({ userRole: 'ADMIN' })).not.toThrow();
    });

    it('lets anyone with canViewAllTasks through', () => {
      expect(() => may({ userRole: 'EMPLOYEE', canViewAllTasks: true })).not.toThrow();
    });

    it('refuses everybody else', () => {
      expect(() => may({ userRole: 'EMPLOYEE' })).toThrow(ForbiddenException);
      expect(() => may({ userRole: 'EMPLOYEE', canViewAllTasks: false })).toThrow(ForbiddenException);
      expect(() => may({ userRole: 'CUSTOMER' })).toThrow(ForbiddenException);
    });

    it('says what was refused, not just that something was', () => {
      expect(() => (svc as any).assertMay({ userRole: 'EMPLOYEE' }, 'delete assets'))
        .toThrow(/delete assets/);
    });
  });

  describe('page size', () => {
    it('caps an absurd request instead of honouring it', () => {
      // ?limit=100000 used to return the table: `limit || 20` honoured anything.
      expect(page(100000)).toBe(200);
      expect(page('100000')).toBe(200);
    });

    it('keeps a sensible request', () => {
      expect(page(50)).toBe(50);
      expect(page(200)).toBe(200);
    });

    it('falls back when nothing usable was asked for', () => {
      for (const junk of [undefined, null, 'abc', NaN, 0, -5]) {
        expect(page(junk)).toBe(20);
      }
      expect(page(undefined, 50)).toBe(50);
    });

    it('never returns a fraction — it becomes a SQL take', () => {
      expect(page(10.9)).toBe(10);
    });
  });
});
