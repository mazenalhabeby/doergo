import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { DocumentsController } from '../documents.controller';

/**
 * Express matches routes in DECLARATION order, so a literal path declared after
 * a parameter path on the same prefix is dead. This codebase has shipped that
 * bug once already, on `/assets/usage`.
 *
 * It matters more here than usual: if `/documents/drafts` were ever swallowed
 * by a `:id` route, the staging area would answer "document not found" for a
 * document id of "drafts" — an error that reads like data loss.
 *
 * Asserted from the metadata Nest actually registers, not from the source text,
 * so moving a method below a parameter route fails this test.
 */
const routesFor = (target: any, method: RequestMethod): string[] =>
  Object.getOwnPropertyNames(target.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => target.prototype[name])
    .filter(
      (fn) => typeof fn === 'function' && Reflect.getMetadata(METHOD_METADATA, fn) === method,
    )
    .map((fn) => (Reflect.getMetadata(PATH_METADATA, fn) as string) ?? '');

/**
 * Express's own rule: an earlier route swallows a later one when every one of
 * its segments either is a parameter or matches the later route's segment.
 *
 * Segment COUNTS alone are not enough — that flagged `templates/preview` as
 * swallowed by `:id/sign`, which cannot match it, because the second segment is
 * the literal "sign". A guard that cries wolf gets relaxed, and this one
 * protects something worth protecting.
 */
const swallows = (earlier: string, later: string): boolean => {
  const a = earlier.split('/');
  const b = later.split('/');
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg.startsWith(':') || seg === b[i]);
};

describe('document route order', () => {
  const gets = routesFor(DocumentsController, RequestMethod.GET);
  const posts = routesFor(DocumentsController, RequestMethod.POST);
  const deletes = routesFor(DocumentsController, RequestMethod.DELETE);

  const swallowed = (routes: string[]) => {
    const out: string[] = [];
    routes.forEach((path, index) => {
      if (path.startsWith(':') || path === '') return;
      const shadowed = routes
        .slice(0, index)
        .some((other) => other.includes(':') && swallows(other, path));
      if (shadowed) out.push(path);
    });
    return out;
  };

  it('declares every literal GET before a parameter route of the same shape', () => {
    expect(swallowed(gets)).toEqual([]);
  });

  it('declares every literal POST before a parameter route of the same shape', () => {
    expect(swallowed(posts)).toEqual([]);
  });

  it('declares every literal DELETE before a parameter route of the same shape', () => {
    expect(swallowed(deletes)).toEqual([]);
  });

  it('reaches the staging area rather than reading "drafts" as a document id', () => {
    expect(gets).toContain('drafts');
    expect(gets).toContain('match-candidates');
    expect(gets).toContain('types');
  });

  it('reaches /documents/publish rather than treating it as a document id', () => {
    expect(posts).toContain('publish');
    expect(posts).toContain('upload-url');
  });

  it('keeps the batch delete distinct from the member delete', () => {
    // `drafts/:id` and `:id` differ in shape, so they cannot collide — but if
    // one were ever flattened, discarding a staged row would delete a member's
    // own document instead.
    expect(deletes).toContain('drafts/:id');
    expect(deletes).toContain(':id');
    expect(swallows(':id', 'drafts/:id')).toBe(false);
  });
});

describe('the guard itself', () => {
  /*
    Tightening `swallowed` to Express's real rule made it stricter about WHICH
    parameter route is a threat. These pin that it still catches the bug it was
    written for — `/assets/usage` declared after `/assets/:id` — rather than
    having been quietly widened into something that passes everything.
  */
  it('catches a literal hidden behind a bare parameter', () => {
    expect(swallows(':id', 'drafts')).toBe(true);
  });

  it('catches a literal hidden behind a parameter with the same tail', () => {
    expect(swallows(':id/report', 'latest/report')).toBe(true);
  });

  it('does not flag a route the parameter route cannot match', () => {
    expect(swallows(':id/sign', 'templates/preview')).toBe(false);
  });

  it('does not flag routes of a different depth', () => {
    expect(swallows(':id', 'templates/preview')).toBe(false);
  });
});
