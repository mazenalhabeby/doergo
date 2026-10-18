import { validateBody } from '../../testing/validate-body';

/** One body family: what real clients send (must pass) and what must be refused. */
export interface BodyCase {
  what: string;
  dto: new () => object;
  sends: unknown;
}

export function describeBodies(family: string, accepted: BodyCase[], refused: BodyCase[]) {
  describe(`${family} bodies`, () => {
    it.each(accepted.map((c) => [c.what, c] as const))('accepts %s', async (_what, c) => {
      const r = await validateBody(c.dto, c.sends);
      expect(r).toMatchObject({ ok: true });
      // What reaches the service is what was sent — implicit conversion once emptied every object array.
      if (r.ok) expect(JSON.parse(JSON.stringify(r.body))).toEqual(JSON.parse(JSON.stringify(c.sends)));
    });
    it.each(refused.map((c) => [c.what, c] as const))('refuses %s', async (_what, c) => {
      const r = await validateBody(c.dto, c.sends);
      expect(r).toMatchObject({ ok: false });
    });
  });
}
