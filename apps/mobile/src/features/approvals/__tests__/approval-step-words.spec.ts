import type { ApprovalItem } from '@hbcfield/shared/client';
import { approvalTags, stepNoticeText } from '../approval-step-words';

const t = ((k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ''}`) as never;
const step = { firstById: 'u1', firstByName: 'Anna Müller', roleName: 'HR', mine: false };
const item = (over: Partial<ApprovalItem>) => ({ data: {}, ...over }) as ApprovalItem;

describe('the step notice says what the caller’s approval does', () => {
  it('finishes it', () => {
    expect(stepNoticeText({ ...step, youFinish: true, waitsForYou: true }, t)).toMatch(/^approvals\.step\.youFinish/);
  });
  it('one of the roles still needed', () => {
    expect(stepNoticeText({ ...step, waitsForYou: true }, t)).toMatch(/^approvals\.step\.youCanGive/);
  });
  it('somebody else', () => {
    expect(stepNoticeText(step, t)).toMatch(/^approvals\.step\.waiting/);
    expect(stepNoticeText({ ...step, mine: true, youFinish: true }, t)).toMatch(/^approvals\.step\.mine/);
  });
});

describe('the marks on an item', () => {
  it('waits for you, dates passed', () => {
    expect(approvalTags(item({ step: { ...step, waitsForYou: true }, data: { datesPassed: true } }))).toEqual([
      'waitsForYou',
      'datesPassed',
    ]);
    expect(approvalTags(item({ step, data: { datesPassed: false } }))).toEqual([]);
  });
});
