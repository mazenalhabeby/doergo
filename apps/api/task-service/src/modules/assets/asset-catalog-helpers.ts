import { normalizeKindShape } from '@hbcfield/shared';

/** Did the parts of a kind that decide readings and due dates change? Labels and colours do not. */
function logRulesChanged(before: unknown, after: unknown): boolean {
  const rules = (raw: unknown) =>
    JSON.stringify(
      normalizeKindShape(raw).logTypes.map((t) => ({
        key: t.key,
        due: t.due,
        meters: t.fields.filter((f) => f.type === 'number' && f.meter).map((f) => f.key),
      })),
    );
  return rules(before) !== rules(after);
}

export { logRulesChanged };
