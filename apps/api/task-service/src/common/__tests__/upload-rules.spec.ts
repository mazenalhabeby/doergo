import { readFileSync } from 'fs';
import { join } from 'path';
import { UPLOAD_RULES, uploadSizeAllowed, uploadTypeAllowed } from '@hbcfield/shared';

/**
 * ONE definition of what may be uploaded. Task attachments, work-log files and
 * shift-issue evidence each kept their own lists and limit.
 */
describe('upload rules', () => {
  it('the three surfaces share the 20 MB limit and the image list', () => {
    const rules = Object.values(UPLOAD_RULES);
    for (const r of rules) {
      expect(r.maxBytes).toBe(20 * 1024 * 1024);
      expect(r.imageTypes).toEqual(UPLOAD_RULES.taskAttachment.imageTypes);
    }
  });

  it('shift-issue evidence refuses Word files — the one named difference', () => {
    const word = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(uploadTypeAllowed(UPLOAD_RULES.taskAttachment, word)).toBe(true);
    expect(uploadTypeAllowed(UPLOAD_RULES.worklog, word)).toBe(true);
    expect(uploadTypeAllowed(UPLOAD_RULES.shiftIssue, word)).toBe(false);
    expect(uploadTypeAllowed(UPLOAD_RULES.shiftIssue, 'application/pdf')).toBe(true);
  });

  it('size: never empty, never above the limit', () => {
    expect(uploadSizeAllowed(UPLOAD_RULES.worklog, 0)).toBe(false);
    expect(uploadSizeAllowed(UPLOAD_RULES.worklog, 20 * 1024 * 1024)).toBe(true);
    expect(uploadSizeAllowed(UPLOAD_RULES.worklog, 20 * 1024 * 1024 + 1)).toBe(false);
  });

  it.each([
    'modules/attachments/attachments-helpers.ts',
    'modules/worklog/worklog-helpers.ts',
    'modules/shift-issues/shift-issues-helpers.ts',
  ])('%s keeps no list of its own', (file) => {
    const src = readFileSync(join(__dirname, '..', '..', file), 'utf8');
    expect(src).toMatch(/UPLOAD_RULES\./);
    expect(src).not.toMatch(/'image\/jpeg'/);
    expect(src).not.toMatch(/\d+\s*\*\s*1024\s*\*\s*1024/);
  });
});
