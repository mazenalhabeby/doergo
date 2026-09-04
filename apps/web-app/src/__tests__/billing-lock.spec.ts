import fs from 'fs';
import path from 'path';

/**
 * A read-only account has to LOOK read-only.
 *
 * The lock itself works — `SubscriptionGuard` returns 402 on every write, and
 * production logs show it refusing clock-ins. What was missing is the app
 * knowing: New Task, Clock In and Add member all rendered normally, so somebody
 * opened a dialog, filled it in, and found out at submit. It was reported as "I
 * can still add tasks in an inactive organization" — and not one of those
 * writes had actually landed.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/**
 * The file with its comments removed.
 *
 * A "must not contain" assertion over raw source matches the prose explaining
 * why the thing is absent — which is how the first version of this suite failed
 * on its own comments. Assertions about behaviour read the code.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the client half of the billing lock', () => {
  const hook = read('src/hooks/use-billing-lock.ts');

  it('locks on exactly the two statuses the server locks on', () => {
    expect(hook).toContain('"incomplete"');
    expect(hook).toContain('"canceled"');
  });

  it('does NOT lock on past_due', () => {
    /*
      Stripe is still retrying a past-due card and emailing the customer. Locking
      there would stop a business working over a payment that may well go
      through on the next attempt — and the server does not lock on it either.
    */
    expect(code('src/hooks/use-billing-lock.ts')).not.toContain('past_due');
  });

  it('says it is a courtesy, not a boundary', () => {
    // The day this hook is mistaken for the enforcement is the day somebody
    // "simplifies" the guard away.
    expect(hook).toMatch(/never a boundary|COURTESY/i);
  });
});

describe('the surfaces that refuse before the typing', () => {
  it.each([
    ['New Task', 'src/app/(dashboard)/tasks/page.tsx'],
    ['Clock in', 'src/components/clock-widget.tsx'],
    ['Add member', 'src/app/(dashboard)/members/page.tsx'],
    // A workspace is what modules are billed AGAINST, so this is the write
    // most worth refusing before somebody names a space and picks its modules.
    ['New Workspace', 'src/app/(dashboard)/locations/page.tsx'],
  ])('%s is disabled while the account is read-only', (_name, file) => {
    const src = read(file);
    expect(src).toContain('useBillingLock');
    expect(src).toContain('billingLocked');
  });
});

describe('the banner', () => {
  const banner = read('src/components/billing-banner.tsx');

  it('says what is actually true, not what it wants', () => {
    // "Your subscription is inactive" describes our billing system. "This
    // account is read-only" describes what the person in front of it can do.
    expect(banner).toContain('This account is read-only');
    expect(banner).toContain('nothing can be changed');
  });

  it('renders solid for the locked state, not as a tint', () => {
    // The other states are suggestions. This one is a fact about the account,
    // and a tinted strip is something people scroll past.
    expect(banner).toContain('hard: true');
    expect(banner).toContain('bg-red-600');
  });

  it('no longer offers a plan to choose', () => {
    // Tiers were removed in August. "Choose plan" sent people looking for a
    // screen that does not exist.
    const src = code('src/components/billing-banner.tsx');
    expect(src).not.toContain('Choose plan');
    expect(src).not.toContain('choose a plan');
  });
});
