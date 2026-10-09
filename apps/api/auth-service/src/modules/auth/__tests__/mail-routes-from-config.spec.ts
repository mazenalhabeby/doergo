import { mailRoutesFromConfig } from '@hbcfield/shared';

/*
  One reading of the twelve SMTP keys, shared by every sender.

  Each service used to spell the keys out by hand; one that dropped the
  fallback block would send through the primary alone, and nothing would show
  it until the primary was blocked.
*/
describe('mailRoutesFromConfig', () => {
  const env: Record<string, string> = {
    SMTP_HOST: 'smtp.primary.test',
    SMTP_PORT: '465',
    SMTP_USER: 'u',
    SMTP_PASS: 'p',
    SMTP_FROM: 'a@primary.test',
    SMTP_FALLBACK_HOST: 'smtp.fallback.test',
    SMTP_FALLBACK_PORT: '587',
    SMTP_FALLBACK_FROM: 'b@fallback.test',
  };

  it('reads primary and fallback through one getter', () => {
    const routes = mailRoutesFromConfig((k) => env[k]);
    expect(routes.map((r) => r.options.host)).toEqual(['smtp.primary.test', 'smtp.fallback.test']);
    expect(routes[0].options.secure).toBe(true); // 465 is implicit TLS
    expect(routes[1].from).toBe('b@fallback.test');
  });

  it('is empty when nothing is configured', () => {
    expect(mailRoutesFromConfig(() => undefined)).toEqual([]);
  });
});
