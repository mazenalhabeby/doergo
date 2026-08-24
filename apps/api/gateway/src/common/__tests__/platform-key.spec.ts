import { ForbiddenException } from '@nestjs/common';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { PlatformAdminGuard } from '../guards/platform-admin.guard';

/**
 * Audit B-B1 — one constant-time check for the operator secret, not two.
 *
 * `PLATFORM_ADMIN_KEY` guards the two most powerful routes in the product: list
 * every organization, and grant an organization every paid capability. The guard
 * did it properly — SHA-256 both sides to a fixed 32 bytes, then `timingSafeEqual`,
 * so neither the length nor the match position leaks. The billing controller had
 * grown its own inline copy using `!==`, and that copy was the one on those two
 * routes.
 */
describe('platform operator key (B-B1)', () => {
  const guard = (key?: string) =>
    new PlatformAdminGuard({ get: () => key } as any);

  const req = (provided?: string) => ({
    headers: provided === undefined ? {} : { 'x-platform-admin-key': provided },
  });

  it('accepts the correct key', () => {
    expect(() => guard('s3cret').assertKey(req('s3cret'))).not.toThrow();
  });

  it('refuses a wrong key', () => {
    expect(() => guard('s3cret').assertKey(req('wrong'))).toThrow(ForbiddenException);
  });

  it('refuses a missing header', () => {
    expect(() => guard('s3cret').assertKey(req())).toThrow(ForbiddenException);
  });

  it('fails CLOSED when the secret is not configured — never open', () => {
    expect(() => guard(undefined).assertKey(req('anything'))).toThrow(ForbiddenException);
    expect(() => guard('').assertKey(req(''))).toThrow(ForbiddenException);
  });

  it('does not leak length: a prefix of the real key is refused like any other', () => {
    expect(() => guard('s3cret').assertKey(req('s3cre'))).toThrow(ForbiddenException);
    expect(() => guard('s3cret').assertKey(req('s3cretX'))).toThrow(ForbiddenException);
  });

  it('NO controller reads the secret itself — the guard is the only implementation', () => {
    // There were three: the guard (constant-time) plus inline `!==` copies in
    // billing and support. The two weak ones guarded "list every organization",
    // "grant an org every capability", and "read any support thread including
    // internal notes". A fourth copy must fail here rather than in production.
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => {
        const full = join(dir, e);
        return statSync(full).isDirectory()
          ? walk(full)
          : full.endsWith('.controller.ts')
            ? [full]
            : [];
      });
    const offenders = walk(join(__dirname, '..', '..', 'modules')).filter((f) =>
      readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .includes('PLATFORM_ADMIN_KEY'),
    );
    expect(offenders.map((f) => f.split('/modules/')[1])).toEqual([]);
  });
});
