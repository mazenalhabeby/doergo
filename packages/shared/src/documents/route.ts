/**
 * A document type's signing route: who signs, in what order.
 *
 * Held on the TYPE as an ordered list of roles, and resolved to real people when
 * a document is issued. Roles rather than names, because naming people on a type
 * means re-editing it whenever somebody leaves — the route has to keep working.
 *
 * Everything here is pure. The decisions it encodes — whether a route is legal,
 * whose turn it is, how far along a document has got — are asked from the
 * service, from the register and from the certificate renderer, and they must
 * not be able to disagree.
 */

/**
 * Who a step asks for.
 *
 *   MEMBER              whoever the document was issued to
 *   RESPONSIBLE         resolved through the member's `approve` routing
 *   ORG_REPRESENTATIVE  somebody signing for the organization — an employment
 *                       contract has an employer on it, not only an employee
 *   CUSTOMER            the space's client; the only role that can be external,
 *                       and therefore the only one that can sign without a
 *                       session
 */
export type DocumentSignerRole =
  | 'MEMBER'
  | 'RESPONSIBLE'
  | 'ORG_REPRESENTATIVE'
  | 'CUSTOMER';

export const DOCUMENT_SIGNER_ROLES: readonly DocumentSignerRole[] = [
  'MEMBER',
  'RESPONSIBLE',
  'ORG_REPRESENTATIVE',
  'CUSTOMER',
] as const;

export type DocumentSignerStatus = 'PENDING' | 'SIGNED' | 'SKIPPED';

/** One step of the route, as stored on the type. */
export interface RouteStep {
  role: DocumentSignerRole;
}

/** One resolved step of a document in flight. */
export interface SignerStep {
  order: number;
  role: DocumentSignerRole;
  status: DocumentSignerStatus;
  userId?: string | null;
  customerId?: string | null;
  signedAt?: Date | string | null;
}

/** The longest route worth allowing. Beyond this it is a workflow, not a form. */
export const MAX_ROUTE_STEPS = 6;

/**
 * Is this a route this product will accept?
 *
 * Returns the reason rather than a boolean, so the message a user sees is
 * written once, here, instead of being reinvented at each call site.
 *
 * `null`/absent is valid and means "no route" — one signature by the member,
 * exactly as before routes existed. That is the behaviour every document issued
 * to date relies on.
 */
export function routeProblem(route: unknown): string | null {
  if (route == null) return null;
  if (!Array.isArray(route)) return 'A signing route must be a list of steps';
  if (route.length === 0) return 'A signing route needs at least one step';
  if (route.length > MAX_ROUTE_STEPS) {
    return `A signing route cannot have more than ${MAX_ROUTE_STEPS} steps`;
  }

  const seen = new Set<DocumentSignerRole>();
  for (const step of route) {
    if (!step || typeof step !== 'object') return 'Each step must name a role';
    const role = (step as RouteStep).role;
    if (!DOCUMENT_SIGNER_ROLES.includes(role)) {
      return `“${String(role)}” is not a kind of signer`;
    }
    /*
      One step per role.

      Not an arbitrary restriction: a role resolves to a person, so the same
      role twice either asks one person to sign twice — which the chain has no
      way to distinguish — or means two different people, which the role cannot
      express. Two customers signing is a real requirement and would need its
      own role, not a repeat of this one.
    */
    if (seen.has(role)) return `A route can only ask ${role} to sign once`;
    seen.add(role);
  }
  return null;
}

/** The stored value as a usable list. Anything invalid reads as no route. */
export function parseRoute(route: unknown): RouteStep[] | null {
  if (routeProblem(route) !== null) return null;
  if (route == null) return null;
  return (route as RouteStep[]).map((s) => ({ role: s.role }));
}

/**
 * Whose turn it is: the first step still pending, in order.
 *
 * SKIPPED steps are passed over rather than blocking — a route that asks for a
 * customer on a document whose space has none must still complete, or the chain
 * strands on a signer who does not exist.
 */
export function nextPendingStep(steps: SignerStep[]): SignerStep | null {
  return (
    [...steps].sort((a, b) => a.order - b.order).find((s) => s.status === 'PENDING') ?? null
  );
}

/** Is this person the one being waited on right now? */
export function isCurrentSigner(steps: SignerStep[], userId: string): boolean {
  const next = nextPendingStep(steps);
  return !!next && next.userId === userId;
}

/**
 * How far along, for a register that has to say "waiting on whom".
 *
 * `total` counts every step including skipped ones, because a person reading
 * "2 of 3" is counting the boxes on the page, not the ones that turned out to
 * apply.
 */
export function chainProgress(steps: SignerStep[]): {
  total: number;
  signed: number;
  current: SignerStep | null;
  complete: boolean;
} {
  const signed = steps.filter((s) => s.status === 'SIGNED').length;
  const current = nextPendingStep(steps);
  return {
    total: steps.length,
    signed,
    current,
    // Complete when nothing is pending — skipped steps do not hold it open.
    complete: steps.length > 0 && current === null,
  };
}

/**
 * How much a signature is worth as evidence.
 *
 * A signer who was already authenticated is a different claim from somebody who
 * followed a link: the first says WHO signed, the second says the link was
 * used. Both are legitimate and the certificate must not present them as equal,
 * so the distinction is named once, here.
 */
export type SignatureStrength = 'SESSION' | 'LINK';

export function signatureStrength(step: { userId?: string | null; email?: string | null }): SignatureStrength {
  return step.userId ? 'SESSION' : 'LINK';
}
