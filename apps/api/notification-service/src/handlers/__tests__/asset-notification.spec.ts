import {
  AssetNotificationHandler,
  EXPENSE_COALESCE_WINDOW_MS,
  type ExpenseSubmittedEvent,
} from '../asset-notification.handler';
import { KeyedCoalescer } from '../../common/keyed-coalescer';

/**
 * Delivering what task-service decided about the organization's things.
 *
 * WHO is pinned in task-service (`asset-notifier.spec.ts`). What is pinned here
 * is delivery: a phone replaying its queue does not buzz an approver once per
 * receipt, the person who acted is never told about their own click, each
 * audience gets its own sentence, and nothing with a name or an amount in it
 * goes to the organization-wide room.
 */

const flush = () => new Promise((r) => setImmediate(r));

describe('AssetNotificationHandler', () => {
  let handler: AssetNotificationHandler;
  const push = { sendToUser: jest.fn() };
  const socket = { emitToUser: jest.fn(), emitToOrganization: jest.fn() };
  const store = { record: jest.fn() };

  beforeEach(() => {
    // setImmediate stays real: it is how a test lets a summary's awaits finish.
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    jest.clearAllMocks();
    handler = new AssetNotificationHandler(push as any, socket as any, store as any);
  });

  afterEach(() => {
    handler.onModuleDestroy();
    jest.useRealTimers();
  });

  const expense = (over: Partial<ExpenseSubmittedEvent> = {}): ExpenseSubmittedEvent => ({
    organizationId: 'org1', entryId: 'm1', assetId: 'a1', assetName: 'Ford Transit', spaceId: null,
    authorId: 'u-ahmed', authorName: 'Ahmed Dessouky', category: 'Fuel', amountCents: 8141,
    occurredAt: '2026-09-14T10:00:00Z', recipientIds: ['u-boss'], ...over,
  });
  const pushesTo = (id: string) => push.sendToUser.mock.calls.filter(([u]) => u === id);

  describe('an expense sent in', () => {
    it('tells each approver, with a link to the asset', async () => {
      await handler.handleExpenseSubmitted(expense({ recipientIds: ['u-boss', 'u-fleet'] }));

      expect(push.sendToUser).toHaveBeenCalledWith(
        'u-boss', 'An expense to confirm', 'Ahmed Dessouky sent Fuel for Ford Transit',
        expect.objectContaining({ type: 'asset.expense_submitted', assetId: 'a1', entryId: 'm1' }),
      );
      expect(pushesTo('u-fleet')).toHaveLength(1);
      expect(store.record).toHaveBeenCalledWith(expect.objectContaining({
        recipientIds: ['u-boss'], organizationId: 'org1', eventType: 'asset.expense_submitted', link: '/assets/a1',
      }));
    });

    it('never tells the person who sent it', async () => {
      await handler.handleExpenseSubmitted(expense({ recipientIds: ['u-ahmed', 'u-boss'] }));
      expect(pushesTo('u-ahmed')).toHaveLength(0);
      expect(socket.emitToUser.mock.calls.map(([u]) => u)).not.toContain('u-ahmed');
    });

    /*
      ⚠️ The case this was built for: an offline phone replays ten receipts in a
      second. The approver hears about the first at once, and about the other
      nine ONCE, when the window closes — not ten buzzes.
    */
    it('folds a replayed burst into one notice and one summary per approver', async () => {
      for (let i = 1; i <= 10; i++) {
        await handler.handleExpenseSubmitted(expense({ entryId: `m${i}` }));
      }
      expect(pushesTo('u-boss')).toHaveLength(1);

      jest.advanceTimersByTime(EXPENSE_COALESCE_WINDOW_MS);
      await flush();

      const calls = pushesTo('u-boss');
      expect(calls).toHaveLength(2);
      expect(calls[1]).toEqual([
        'u-boss', 'Expenses to confirm', 'Ahmed Dessouky sent 9 more for Ford Transit',
        expect.objectContaining({ type: 'asset.expense_submitted', assetId: 'a1', count: 9 }),
      ]);
      // Bell entries follow the pushes, not the filings.
      expect(store.record).toHaveBeenCalledTimes(2);

      // And the window closes when it goes quiet: the next filing is news again.
      jest.advanceTimersByTime(EXPENSE_COALESCE_WINDOW_MS);
      await handler.handleExpenseSubmitted(expense({ entryId: 'm11' }));
      expect(pushesTo('u-boss')).toHaveLength(3);
    });

    it('coalesces per asset — a second vehicle is a second thing to confirm', async () => {
      await handler.handleExpenseSubmitted(expense({ assetId: 'a1' }));
      await handler.handleExpenseSubmitted(expense({ assetId: 'a2', assetName: 'Opel Vivaro' }));
      expect(pushesTo('u-boss')).toHaveLength(2);
    });

    it('coalesces per approver — one busy colleague does not silence another', async () => {
      await handler.handleExpenseSubmitted(expense({ recipientIds: ['u-boss'] }));
      await handler.handleExpenseSubmitted(expense({ entryId: 'm2', recipientIds: ['u-boss', 'u-fleet'] }));
      expect(pushesTo('u-boss')).toHaveLength(1);
      expect(pushesTo('u-fleet')).toHaveLength(1);
    });

    it('counts rather than names when several people filed at once', async () => {
      await handler.handleExpenseSubmitted(expense());
      await handler.handleExpenseSubmitted(expense({ entryId: 'm2', authorId: 'u-mira', authorName: 'Mira K' }));
      await handler.handleExpenseSubmitted(expense({ entryId: 'm3' }));
      jest.advanceTimersByTime(EXPENSE_COALESCE_WINDOW_MS);
      await flush();
      expect(pushesTo('u-boss')[1]?.[2]).toBe('2 more expenses sent in for Ford Transit');
    });

    it('still updates an open queue live for every filing', async () => {
      await handler.handleExpenseSubmitted(expense());
      await handler.handleExpenseSubmitted(expense({ entryId: 'm2' }));
      expect(socket.emitToUser.mock.calls.filter(([u, e]) => u === 'u-boss' && e === 'asset.expense_submitted')).toHaveLength(2);
    });

    /*
      ⚠️ The organization room reaches everybody in it, so it carries ids and
      nothing else — never a name or an amount.
    */
    it('tells the organization room ids only', async () => {
      await handler.handleExpenseSubmitted(expense());
      expect(socket.emitToOrganization).toHaveBeenCalledWith('org1', 'asset.expensesChanged', { assetId: 'a1', entryId: 'm1' });
    });

    it('keeps delivering the bell when a phone cannot be reached', async () => {
      push.sendToUser.mockRejectedValueOnce(new Error('expo down'));
      await handler.handleExpenseSubmitted(expense());
      expect(store.record).toHaveBeenCalledTimes(1);
    });
  });

  describe('an expense decided', () => {
    const decided = (over: any = {}) => ({
      organizationId: 'org1', entryId: 'm1', assetId: 'a1', assetName: 'Ford Transit', authorId: 'u-ahmed',
      decision: 'accept', note: null, amountCents: 8141, category: 'Fuel', ...over,
    });

    it('tells the author it was accepted', async () => {
      await handler.handleExpenseDecided(decided());
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
      expect(push.sendToUser).toHaveBeenCalledWith('u-ahmed', 'Expense accepted', 'Fuel for Ford Transit',
        expect.objectContaining({ type: 'asset.expense_decided', decision: 'accept' }));
      expect(store.record).toHaveBeenCalledWith(expect.objectContaining({ recipientIds: ['u-ahmed'], link: '/assets/a1' }));
    });

    it('carries the reason when it was refused', async () => {
      await handler.handleExpenseDecided(decided({ decision: 'reject', note: 'Not our van' }));
      expect(push.sendToUser).toHaveBeenCalledWith('u-ahmed', 'Expense refused', 'Fuel for Ford Transit: Not our van', expect.anything());
    });

    it('still says something when refused without a reason', async () => {
      await handler.handleExpenseDecided(decided({ decision: 'reject', note: '' }));
      expect(push.sendToUser.mock.calls[0][2]).toBe('Fuel for Ford Transit was not accepted');
    });
  });

  describe('a handover', () => {
    const handed = (over: any = {}) => ({
      organizationId: 'org1', assetId: 'a1', assetName: 'Ford Transit',
      openedUserIds: ['u-mira'], closedUserIds: ['u-ahmed'], byUserId: 'u-boss', at: '2026-09-15T10:00:00Z', ...over,
    });

    it('tells the receiver it is theirs and the other person it went back', async () => {
      await handler.handleHandedOver(handed());
      expect(push.sendToUser).toHaveBeenCalledWith('u-mira', 'Handed over to you', 'Ford Transit is now with you',
        expect.objectContaining({ type: 'asset.handed_over', direction: 'to' }));
      expect(push.sendToUser).toHaveBeenCalledWith('u-ahmed', 'Handed back', 'Ford Transit was handed back',
        expect.objectContaining({ type: 'asset.handed_over', direction: 'from' }));
      expect(store.record).toHaveBeenCalledTimes(2);
      expect(socket.emitToOrganization).toHaveBeenCalledWith('org1', 'asset.custodyChanged', { assetId: 'a1' });
    });

    it('never tells whoever made the change', async () => {
      await handler.handleHandedOver(handed({ openedUserIds: ['u-boss'], closedUserIds: ['u-ahmed'] }));
      expect(pushesTo('u-boss')).toHaveLength(0);
      expect(pushesTo('u-ahmed')).toHaveLength(1);
    });

    it('tells somebody given the thing back once, as a receiver', async () => {
      await handler.handleHandedOver(handed({ openedUserIds: ['u-ahmed'], closedUserIds: ['u-ahmed'] }));
      expect(pushesTo('u-ahmed')).toEqual([['u-ahmed', 'Handed over to you', expect.any(String), expect.anything()]]);
    });
  });
});

describe('KeyedCoalescer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('delivers the first at once and holds the rest for one summary', () => {
    const summaries: Array<[string, number[]]> = [];
    const c = new KeyedCoalescer<number>(1000, (k, held) => { summaries.push([k, held]); });
    expect(c.offer('k', 1)).toBe(true);
    expect(c.offer('k', 2)).toBe(false);
    expect(c.offer('k', 3)).toBe(false);
    jest.advanceTimersByTime(1000);
    expect(summaries).toEqual([['k', [2, 3]]]);
    c.dispose();
  });

  it('sends no summary for a lone event, and forgets the key', () => {
    const onSummary = jest.fn();
    const c = new KeyedCoalescer<number>(1000, onSummary);
    c.offer('k', 1);
    jest.advanceTimersByTime(1000);
    expect(onSummary).not.toHaveBeenCalled();
    expect(c.offer('k', 2)).toBe(true);
    c.dispose();
  });

  it('survives a summary that throws', () => {
    const c = new KeyedCoalescer<number>(1000, () => { throw new Error('boom'); });
    c.offer('k', 1);
    c.offer('k', 2);
    expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
    c.dispose();
  });
});
