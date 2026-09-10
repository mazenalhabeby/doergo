import { Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { PERMISSIONS_KEY } from '@hbcfield/shared';
import { AssetsController } from '../assets.controller';

/**
 * Who may do what with somebody else's fuel receipt.
 *
 * This surface has three different kinds of authorization sitting side by side,
 * and each is wrong in a different direction if it drifts:
 *
 *   · CUSTODY — filing an expense. Gated on having HELD the thing on the day
 *     the money moved, decided in the service. Adding a permission decorator
 *     here would lock every driver out of the only screen built for them.
 *   · OWNERSHIP — "what I hold", "what I sent in". The filter IS the
 *     authorization; it can only ever return the caller's own rows.
 *   · canManageAssets — accepting an expense, and handing an asset over. These
 *     move the organization's books and its property.
 *
 * Read off the metadata Nest actually registers, not the source text, so
 * moving a decorator fails this rather than looking fine in review.
 */
const reflector = new Reflector();

const routeOf = (name: string) => {
  const fn = (AssetsController.prototype as any)[name];
  expect(typeof fn).toBe('function');
  return {
    path: Reflect.getMetadata(PATH_METADATA, fn) as string,
    method: Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod,
    permissions: reflector.get<string[]>(PERMISSIONS_KEY, fn),
  };
};

describe('filing an expense is authorised by custody, not by a permission', () => {
  /*
    ⚠️ The failure this prevents is silent and total.

    A driver holds no asset permission and never will — `canManageAssets` lets
    somebody edit the register, which is not what filling a tank is. Put either
    permission above these two and the feature still compiles, still passes
    every other test, and is unusable by every single person it was built for.
  */
  it.each(['submitExpense', 'presignReceipt'])('%s asks for no permission', (name) => {
    expect(routeOf(name).permissions).toBeUndefined();
  });

  it.each(['mine', 'myExpenses'])('%s asks for no permission either — it returns only my own rows', (name) => {
    expect(routeOf(name).permissions).toBeUndefined();
  });
});

describe('the books are moved only by someone who may manage them', () => {
  /*
    The mirror-image failure. `canViewAllTasks` is held by an external
    supervisor and is used across this product as a loose proxy for "is a
    manager" — so a review or a handover gated on it hands an outsider the
    ability to accept spending and to reassign the organization's vehicles.
  */
  it.each(['reviewExpense', 'handOver'])('%s requires canManageAssets', (name) => {
    expect(routeOf(name).permissions).toEqual(['canManageAssets']);
  });

  it.each(['reviewExpense', 'handOver'])('%s is a POST, so no read path reaches it', (name) => {
    expect(routeOf(name).method).toBe(RequestMethod.POST);
  });
});

describe('reading other people’s custody', () => {
  it.each(['custody', 'custodyForMember', 'pendingExpenses'])('%s requires canViewAllTasks', (name) => {
    expect(routeOf(name).permissions).toEqual(['canViewAllTasks']);
  });
});

describe('a member sends a page in; only the office turns it into a thing', () => {
  /*
    ⚠️ THE POINT OF THE WHOLE PROPOSALS FEATURE.

    The driver holding the rental agreement is precisely the person who holds no
    asset permission and never will. Gate the raise and there is nobody left who
    can use it — so these four carry no permission at all, and what they do is
    bounded by the caller's own id inside the service: raise one, list your own,
    withdraw your own, open your own page.
  */
  it.each(['raiseProposal', 'myProposals', 'withdrawProposal', 'proposalUploadUrl', 'proposalDocumentUrl'])(
    '%s asks for no permission — the caller\'s own id is the boundary',
    (name) => {
      expect(routeOf(name).permissions).toBeUndefined();
    },
  );

  /*
    ⚠️ And the mirror. Accepting one CREATES the record, hands it over and can
    take a vehicle off the books — it IS `/contracts/apply` — so it asks exactly
    what that asks. A proposals queue whose accept button were reachable by
    everyone who can read would have moved the create, not removed it.
  */
  it.each(['acceptProposal', 'rejectProposal'])('%s requires canManageAssets', (name) => {
    expect(routeOf(name).permissions).toEqual(['canManageAssets']);
  });

  it('the queue itself is a read of other people’s, so it asks to look', () => {
    expect(routeOf('pendingProposals').permissions).toEqual(['canViewAllTasks']);
  });

  /*
    Declared before `:id`. `/assets/proposals/mine` has two segments so `:id`
    cannot swallow it — but `:id/custody` and its siblings are two segments too,
    and the day somebody adds `:id/mine` the order is all that saves it.
  */
  it('declares the proposal reads before the parameter routes', () => {
    const order = Object.getOwnPropertyNames(AssetsController.prototype)
      .filter((n) => n !== 'constructor')
      .map((n) => (AssetsController.prototype as any)[n])
      .filter((fn) => typeof fn === 'function' && Reflect.getMetadata(METHOD_METADATA, fn) === RequestMethod.GET)
      .map((fn) => Reflect.getMetadata(PATH_METADATA, fn) as string);
    expect(order.indexOf('proposals/mine')).toBeLessThan(order.indexOf(':id'));
    expect(order.indexOf('proposals/pending')).toBeLessThan(order.indexOf(':id'));
  });
});

describe('the contract flow asks the write permission throughout', () => {
  /*
    ⚠️ Including the two routes that write nothing, and that is deliberate.

    A PREVIEW answers a question about the organization's property: give it a
    kind and a member and it says what that person is holding and what would be
    taken off the books. `canViewAllTasks` is held by an external supervisor,
    and enumerating the fleet a member drives is not something being shown a
    site should buy. There is also no caller for it — nobody previews a contract
    they cannot apply.
  */
  it.each(['readContract', 'previewContract', 'applyContract'])('%s requires canManageAssets', (name) => {
    expect(routeOf(name).permissions).toEqual(['canManageAssets']);
  });

  /*
    ⚠️ All three are POSTs, and preview is one on purpose: it carries a plate, a
    VIN and a person's id. A GET would put every one of them in a URL, and this
    gateway logs URLs.
  */
  it.each(['readContract', 'previewContract', 'applyContract'])('%s is a POST, so a VIN never lands in a URL', (name) => {
    expect(routeOf(name).method).toBe(RequestMethod.POST);
  });
});

describe('a receipt link is minted, never listed', () => {
  /*
    A GET would be cacheable, shareable and logged with the rest of the URL
    line; a POST that mints a short-lived link makes looking at somebody's
    spending an act rather than a side effect of opening a page. Same rule the
    personnel file already applies to a member document.
  */
  it('is a POST', () => {
    expect(routeOf('receiptUrl').method).toBe(RequestMethod.POST);
    expect(routeOf('receiptUrl').path).toBe('expenses/:entryId/receipt-url');
  });
});

describe('route order', () => {
  /*
    `/assets/mine` is a single static segment on the same prefix as `:id`.
    Express matches in declaration order, so declared after it, "mine" is read
    as an asset id and every driver's screen answers 404 — the exact bug this
    controller has already shipped once, for `/assets/usage`.
  */
  it('declares mine before :id', () => {
    const order = Object.getOwnPropertyNames(AssetsController.prototype)
      .filter((n) => n !== 'constructor')
      .map((n) => (AssetsController.prototype as any)[n])
      .filter((fn) => typeof fn === 'function' && Reflect.getMetadata(METHOD_METADATA, fn) === RequestMethod.GET)
      .map((fn) => Reflect.getMetadata(PATH_METADATA, fn) as string);
    expect(order.indexOf('mine')).toBeGreaterThan(-1);
    expect(order.indexOf('mine')).toBeLessThan(order.indexOf(':id'));
  });
});
