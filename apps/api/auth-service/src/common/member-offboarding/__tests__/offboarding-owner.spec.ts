import * as fs from 'fs';
import * as path from 'path';

/*
  Leaving is task-service's to carry out (`member_offboard`).

  auth-service used to write task-service's tables directly when somebody left,
  in three different ways that disagreed — one reset every task the person had
  ever held to NEW, finished history included, and none released crew places or
  equipment custody. The account services now ask task-service; this fails if a
  direct write to those tables comes back into them.
*/
const FILES = ['../../../modules/users/users.service.ts', '../../../modules/auth/auth.service.ts'].map((f) => path.resolve(__dirname, f));
const TASK_TABLE_WRITE = /\b(task|taskAssignee|assetCustody|assetHolder)\.(update|updateMany|delete|deleteMany|create|createMany|upsert)\(/;

describe('member offboarding', () => {
  it('the account services never write task-service tables', () => {
    const offenders = FILES.filter((f) => TASK_TABLE_WRITE.test(fs.readFileSync(f, 'utf8'))).map((f) => path.basename(f));
    expect(offenders).toEqual([]);
  });

  it('every way of leaving asks task-service first', () => {
    const users = fs.readFileSync(FILES[0]!, 'utf8');
    const auth = fs.readFileSync(FILES[1]!, 'utf8');
    expect(users).toMatch(/offboarding\?\.release\(organizationId, memberId, requesterId\)/);
    expect(auth).toMatch(/offboarding\?\.release\(user\.organizationId, user\.id, user\.id\)/);
  });
});
