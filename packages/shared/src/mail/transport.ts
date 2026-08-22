/**
 * SMTP connection settings, derived once from the environment.
 *
 * Two services send email — auth-service (password resets) and
 * notification-service (everything else) — and each built its own transport
 * with `secure: false` hard-coded and the port passed through as whatever
 * string the environment held. That combination quietly rules out **port 465**,
 * which is implicit TLS and what most providers offer: Resend, Brevo, Fastmail,
 * Gmail. Changing provider therefore meant changing code in two places, which
 * is exactly the wrong thing to discover during an outage.
 *
 * So the decision lives here, once, and each service passes the result to
 * `nodemailer.createTransport`. No nodemailer import: this returns a plain
 * options object, so the shared package stays free of a mail dependency.
 */

export interface SmtpEnv {
  SMTP_HOST?: string;
  SMTP_PORT?: string | number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  /** Force implicit TLS on/off. Omit and it follows the port. */
  SMTP_SECURE?: string | boolean;
  SMTP_FROM?: string;

  /*
    A SECOND provider, tried when the first will not take the message.

    Not a replacement for the first — both stay configured. One provider
    blocking our IP took down every email the product sends, and the answer to
    that is not to move the single point of failure somewhere else.
  */
  SMTP_FALLBACK_HOST?: string;
  SMTP_FALLBACK_PORT?: string | number;
  SMTP_FALLBACK_USER?: string;
  SMTP_FALLBACK_PASS?: string;
  SMTP_FALLBACK_SECURE?: string | boolean;
  /** Providers usually refuse a From they have not verified — hence its own. */
  SMTP_FALLBACK_FROM?: string;
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  /** Fail fast. A blocked or unreachable provider must not hold a request open. */
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

const truthy = (v: string | boolean | undefined): boolean | undefined => {
  if (v === undefined || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
};

/**
 * `null` when no host is configured — the caller should not build a transport
 * at all, and saying so with a type is better than handing back settings that
 * cannot connect.
 */
export function smtpTransportOptions(env: SmtpEnv): SmtpTransportOptions | null {
  const host = (env.SMTP_HOST ?? '').trim();
  if (!host) return null;

  const port = Number(env.SMTP_PORT ?? 587) || 587;
  // 465 is implicit TLS; 587 and 25 negotiate with STARTTLS. An explicit
  // SMTP_SECURE wins, because a provider is always allowed to be unusual.
  const secure = truthy(env.SMTP_SECURE) ?? port === 465;

  const user = (env.SMTP_USER ?? '').trim();
  const pass = env.SMTP_PASS ?? '';

  return {
    host,
    port,
    secure,
    ...(user ? { auth: { user, pass } } : {}),
    // Ten seconds each. The default is minutes, which is how a refusing
    // provider turned into requests that hung rather than errors that showed.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/** One configured way out, with the sender address that provider will accept. */
export interface MailRoute {
  /** For logs: which provider actually delivered, or refused. */
  label: string;
  options: SmtpTransportOptions;
  /** `undefined` → the caller's default From. */
  from?: string;
}

/**
 * Every configured route, in the order they should be tried.
 *
 * Primary first, fallback second, and anything unconfigured simply absent — so
 * a deployment with one provider behaves exactly as it did before, and adding a
 * second is purely additive. The From is per route on purpose: a provider will
 * reject a sender address it has not verified, so a fallback that had to borrow
 * the primary's From would be refused for a different reason and look like the
 * same outage.
 */
export function mailRoutes(env: SmtpEnv): MailRoute[] {
  const routes: MailRoute[] = [];

  const primary = smtpTransportOptions(env);
  if (primary) routes.push({ label: primary.host, options: primary, from: env.SMTP_FROM });

  const fallback = smtpTransportOptions({
    SMTP_HOST: env.SMTP_FALLBACK_HOST,
    SMTP_PORT: env.SMTP_FALLBACK_PORT,
    SMTP_USER: env.SMTP_FALLBACK_USER,
    SMTP_PASS: env.SMTP_FALLBACK_PASS,
    SMTP_SECURE: env.SMTP_FALLBACK_SECURE,
  });
  if (fallback) {
    routes.push({
      label: `${fallback.host} (fallback)`,
      options: fallback,
      from: env.SMTP_FALLBACK_FROM || env.SMTP_FROM,
    });
  }

  return routes;
}

/**
 * Try each route until one accepts the message.
 *
 * Returns the label that succeeded, so the caller can log which provider
 * carried it — when two are configured, "the email sent" is not enough to know
 * whether the primary is quietly broken.
 *
 * Throws only when every route failed, carrying all of their errors: a fallback
 * that also fails must not hide why the primary did.
 */
export async function sendViaFirstWorking(
  attempts: Array<{ label: string; send: () => Promise<unknown> }>,
): Promise<{ label: string }> {
  if (!attempts.length) throw new Error('No SMTP route is configured');
  const failures: string[] = [];
  for (const a of attempts) {
    try {
      await a.send();
      return { label: a.label };
    } catch (err) {
      failures.push(`${a.label}: ${(err as Error).message}`);
    }
  }
  throw new Error(failures.join(' | '));
}
