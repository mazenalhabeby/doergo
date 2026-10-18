import { memo } from 'react';
import { DIAGRAMS } from './reports-builder';
export { DIAGRAM_KEYS, hasDiagram } from './reports-builder';

/**
 * One diagram per module and option, each showing that specific thing.
 *
 * The first version had eight reusable shapes shared across twenty-eight
 * entries, on the reasoning that bespoke artwork would not survive the backlog.
 * That was wrong in practice: Epics and Subtasks drew the identical four blank
 * rectangles, and a picture that could belong to any module tells you nothing
 * about the one you are reading. Generic is worse than none.
 *
 * Two rules keep these maintainable anyway:
 *
 *  • NO WORDS. Everything is shapes, numbers, times and currency, which read
 *    the same in all five languages. The sentence underneath is the caption
 *    from i18n; the picture itself never needs translating or redrawing.
 *
 *  • Semantic tokens only, so light and dark come free.
 *
 * Keyed by module/option key. A key with no entry renders no figure at all
 * rather than a placeholder.
 */

export const ExplainerDiagram = memo(function ExplainerDiagram({
  explainerKey,
  caption,
}: {
  explainerKey: string;
  caption?: string;
}) {
  const Shape = DIAGRAMS[explainerKey];
  if (!Shape) return null;
  return (
    <figure className="my-1 rounded-xl border border-border bg-muted/40 px-4 py-4 text-foreground">
      <Shape />
      {caption ? (
        <figcaption className="mt-2.5 text-center text-[11.5px] leading-snug text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
});
