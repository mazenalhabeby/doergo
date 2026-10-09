import { redactUrlForLog, REDACTED } from '@hbcfield/shared';

/**
 * Some request paths ARE a bearer secret. The request logger (main.ts) and the
 * exception filter print/echo the URL, so each such path must come out redacted.
 */
describe('redactUrlForLog', () => {
  it.each([
    ['/api/v1/calendar-feed/abc123SECRET.ics', `/api/v1/calendar-feed/${REDACTED}`],
    ['/api/v1/invitations/validate/K7Q2M9XW3P', `/api/v1/invitations/validate/${REDACTED}`],
    ['/api/v1/onboarding/validate-org-code/ACME2026', `/api/v1/onboarding/validate-org-code/${REDACTED}`],
    ['/api/v1/users/push-token/ExponentPushToken[xyz]', `/api/v1/users/push-token/${REDACTED}`],
  ])('hides the secret in %s', (url, expected) => {
    expect(redactUrlForLog(url)).toBe(expected);
    expect(redactUrlForLog(url)).not.toMatch(/SECRET|K7Q2|ACME|xyz/);
  });

  it('drops the query string, where tokens also ride', () => {
    expect(redactUrlForLog('/api/v1/tasks?token=abc&x=1')).toBe(`/api/v1/tasks?${REDACTED}`);
  });

  it('leaves an ordinary path readable', () => {
    expect(redactUrlForLog('/api/v1/tasks/cl123/comments')).toBe('/api/v1/tasks/cl123/comments');
    expect(redactUrlForLog('/api/v1/invitations')).toBe('/api/v1/invitations');
  });

  it('survives nothing', () => {
    expect(redactUrlForLog(undefined)).toBe('');
    expect(redactUrlForLog('')).toBe('');
  });

  it('is what the logger and the filter actually call', () => {
    const fs = require('fs');
    const path = require('path');
    const main = fs.readFileSync(path.join(__dirname, '../../../main.ts'), 'utf8');
    const filter = fs.readFileSync(path.join(__dirname, '../http-exception.filter.ts'), 'utf8');
    expect(main).toMatch(/redactUrlForLog\(/);
    expect(filter).not.toMatch(/\$\{request\.url\}|path: request\.url/);
  });
});
