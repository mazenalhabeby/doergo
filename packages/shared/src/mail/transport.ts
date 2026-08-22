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
