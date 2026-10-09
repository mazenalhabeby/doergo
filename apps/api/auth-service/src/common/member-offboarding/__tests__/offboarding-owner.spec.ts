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
/*
  Member management and authentication are facades over several collaborators,
  so every source file in both modules is read — a write that moved into one of
  them is still a write from the account services.
*/
const USERS_DIR = path.resolve(__dirname, '../../../modules/users');
const USERS_FILES = fs
  .readdirSync(USERS_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  .map((f) => path.join(USERS_DIR, f));
const AUTH_DIR = path.resolve(__dirname, '../../../modules/auth');
const AUTH_FILES = fs
  .readdirSync(AUTH_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  .map((f) => path.join(AUTH_DIR, f));
const SHARING_FILE = path.resolve(__dirname, '../../../modules/space-sharing/space-sharing.service.ts');
const FILES = [...USERS_FILES, ...AUTH_FILES, SHARING_FILE];
const readAll = (files: string[]) => files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const TASK_TABLE_WRITE = /\b(task|taskAssignee|assetCustody|assetHolder|technicianSchedule|timeOff|spaceAssignment)\.(update|updateMany|delete|deleteMany|create|createMany|upsert)\(/;

describe('member offboarding', () => {
  it('the account services never write task-service tables', () => {
    const offenders = FILES.filter((f) => TASK_TABLE_WRITE.test(fs.readFileSync(f, 'utf8'))).map((f) => path.basename(f));
    expect(offenders).toEqual([]);
  });

  it('every way of leaving asks task-service first', () => {
    expect(USERS_FILES.map((f) => path.basename(f))).toEqual(expect.arrayContaining(['users.service.ts', 'member-admin.service.ts']));
    const users = readAll(USERS_FILES);
    expect(AUTH_FILES.map((f) => path.basename(f))).toEqual(expect.arrayContaining(['auth.service.ts', 'own-account-security.service.ts']));
    const auth = readAll(AUTH_FILES);
    expect(users).toMatch(/offboarding\?\.release\(organizationId, memberId, requesterId\)/);
    expect(auth).toMatch(/offboarding\?\.release\(user\.organizationId, user\.id, user\.id, \{ erase: true \}\)/);
  });
});
