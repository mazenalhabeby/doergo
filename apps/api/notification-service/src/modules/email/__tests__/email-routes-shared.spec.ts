import { EmailService } from '../email.service';

/*
  notification-service reads its SMTP routes through the shared
  `mailRoutesFromConfig` — the same twelve keys, the same order, as
  auth-service. A hand-written list here was a second copy that could forget the
  fallback provider and send through the primary alone, silently.
*/
describe('EmailService mail routes', () => {
  const service = (env: Record<string, string>) =>
    new EmailService({ get: (k: string, f?: unknown) => env[k] ?? f } as any, {} as any) as any;

  it('builds the primary and the fallback, in that order', () => {
    const s = service({
      SMTP_HOST: 'smtp.primary.test',
      SMTP_PORT: '465',
      SMTP_FALLBACK_HOST: 'smtp.fallback.test',
      SMTP_FALLBACK_FROM: 'noreply@fallback.test',
    });
    expect(s.routes.map((r: any) => r.label)).toEqual(['smtp.primary.test', 'smtp.fallback.test (fallback)']);
    expect(s.routes[0].options.secure).toBe(true);
    expect(s.routes[1].from).toBe('noreply@fallback.test');
  });

  it('builds nothing when no host is configured', () => {
    expect(service({}).routes).toEqual([]);
  });
});
