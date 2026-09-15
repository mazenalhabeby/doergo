import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { BillingService } from '../../billing/billing.service';
import { GraceTokenCache } from '../grace-token-cache.service';

/*
  The reset email is written in the language the member reads the app in.

  It is the one email a member gets precisely when they cannot get into the
  app — the worst moment to receive instructions in a language they do not
  read. The language rides on the same row the address comes from, so asking
  for it costs nothing; forgetting to SELECT it costs the language silently,
  which is what the first assertion is for.
*/
describe('password reset email language', () => {
  let service: AuthService;
  const sendMail = jest.fn().mockResolvedValue({});

  const prisma: Record<string, any> = {
    user: { findUnique: jest.fn() },
    passwordResetToken: { deleteMany: jest.fn(), create: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        // No SMTP in the environment; the route is planted below.
        { provide: ConfigService, useValue: { get: jest.fn((_k: string, fallback?: unknown) => fallback) } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: BillingService, useValue: {} },
        { provide: GraceTokenCache, useValue: {} },
      ],
    }).compile();
    service = module.get(AuthService);
    (service as any).mailRoutes = [
      { label: 'test', options: { host: 'test', port: 465 }, tx: { sendMail, verify: jest.fn().mockResolvedValue(true) } },
    ];
  });

  const request = async (locale: string | null) => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'm@x.at', firstName: '<Mia>', locale });
    await service.forgotPassword({ email: 'M@x.at' });
    return sendMail.mock.calls[0][0];
  };

  it('reads the member’s language with the address', async () => {
    await request('de');
    expect(prisma.user.findUnique.mock.calls[0][0].select).toMatchObject({ email: true, locale: true });
  });

  it.each([
    ['de', 'HBCField – Passwort zurücksetzen', 'Guten Tag &lt;Mia&gt;,'],
    ['es', 'HBCField – Restablece tu contraseña', 'Hola, &lt;Mia&gt;:'],
    ['fr', 'HBCField – Réinitialisez votre mot de passe', 'Bonjour &lt;Mia&gt;,'],
    ['it', 'HBCField – Reimposta la password', 'Ciao &lt;Mia&gt;,'],
    [null, 'HBCField – Reset your password', 'Hello &lt;Mia&gt;,'],
  ])('writes it in %p', async (locale, subject, greeting) => {
    const mail = await request(locale);
    expect(mail.to).toBe('m@x.at');
    expect(mail.subject).toBe(subject);
    expect(mail.html).toContain(greeting);
    expect(mail.html).toContain(`<html lang="${locale ?? 'en'}" dir="ltr">`);
    expect(mail.html).toContain('/reset-password?token=');
  });
});
