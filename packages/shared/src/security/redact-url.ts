/**
 * A request URL as it may be WRITTEN TO A LOG.
 *
 * Some URLs carry the credential itself in the path — a calendar feed link, an
 * invitation code, an organization join code, a device's push token. Each
 * is a bearer secret: whoever holds it is let in. A request logger that prints
 * the path verbatim copies those secrets into every log sink and every person
 * who can read one.
 *
 * Pure and node-free (string work only), so the gateway's logger and its test
 * read the same rule. Add a route here the day a new secret starts travelling
 * in a path — `redact-url.spec.ts` in the gateway lists the known ones.
 *
 * The query string is dropped entirely: tokens ride there too (`?token=`), and
 * a log line has never needed one to be useful.
 */
const SECRET_PATH_SEGMENTS: RegExp[] = [
  // GET /calendar-feed/<token>.ics — the member's private ICS link.
  /(\/calendar-feed\/)[^/?#]+/i,
  // GET /invitations/validate/<code> — an invitation is a bearer credential.
  /(\/invitations\/validate\/)[^/?#]+/i,
  // GET /onboarding/validate-org-code/<code> — the organization's join code.
  /(\/onboarding\/validate-org-code\/)[^/?#]+/i,
  // DELETE /users/push-token/<token> — an Expo push token addresses a device.
  /(\/users\/push-token\/)[^/?#]+/i,
  // The client's signing link is NOT here on purpose: `documents/sign` takes its
  // token in the BODY (see sign-link.controller.ts), which never reaches a log.
];

export const REDACTED = '[redacted]';

export function redactUrlForLog(url: string | null | undefined): string {
  if (!url) return '';
  let path = String(url);
  const q = path.search(/[?#]/);
  const hadQuery = q !== -1;
  if (hadQuery) path = path.slice(0, q);
  for (const re of SECRET_PATH_SEGMENTS) path = path.replace(re, `$1${REDACTED}`);
  return hadQuery ? `${path}?${REDACTED}` : path;
}
