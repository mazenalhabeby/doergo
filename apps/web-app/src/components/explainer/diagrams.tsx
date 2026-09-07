import { memo, type ReactElement } from 'react';
import type { DiagramId } from '@/lib/explainers/registry';

/**
 * The eight shapes every explainer draws from.
 *
 * Bespoke artwork per module does not survive a backlog: the next module ships
 * without a picture, then the one after that, and soon half the dialogs look
 * unfinished. A small set of primitives that each cover several modules stays
 * complete on its own.
 *
 * Every shape is built from `currentColor` and the semantic palette, so it
 * inherits light and dark mode with no second asset and no flash of the wrong
 * colours. They are decorative — labels come from the surrounding copy, which
 * is what keeps them translatable without redrawing anything.
 */

const STROKE = 'stroke-border';
const INK = 'fill-primary/12 stroke-primary/45';
const INK_DONE = 'fill-emerald-500/15 stroke-emerald-500/50';
const MUTED = 'fill-muted-foreground/15 stroke-muted-foreground/30';

function Arrow({ x, y, w = 18 }: { x: number; y: number; w?: number }) {
  return (
    <path
      d={`M${x} ${y} h${w - 5} m0 0 l-4 -3 m4 3 l-4 3`}
      className="stroke-muted-foreground/50"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
    />
  );
}

/** Ordered states with arrows — workflows, dependencies, phases, approvals. */
const Flow = () => (
  <svg viewBox="0 0 400 74" className="w-full" role="presentation">
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x={8 + i * 132} y={22} width={106} height={30} rx="8" className={i === 2 ? INK_DONE : INK} strokeWidth="1.5" />
        <rect x={28 + i * 132} y={33} width={66} height={8} rx="4" className="fill-current opacity-25" />
        {i < 2 && <Arrow x={118 + i * 132} y={37} />}
      </g>
    ))}
  </svg>
);

/** Planned against actual — the clock, shifts, sprints, recurrence. */
const Timeline = () => (
  <svg viewBox="0 0 400 92" className="w-full" role="presentation">
    <rect x="8" y="14" width="384" height="18" rx="6" className={MUTED} strokeWidth="1.5" />
    <rect x="64" y="40" width="272" height="18" rx="6" className={INK} strokeWidth="1.5" />
    <rect x="64" y="66" width="120" height="12" rx="4" className="fill-emerald-500/70" />
    <rect x="196" y="66" width="140" height="12" rx="4" className="fill-emerald-500/70" />
    <rect x="184" y="66" width="12" height="12" rx="3" className="fill-amber-500/70" />
    <g className={STROKE} strokeDasharray="3 3" strokeWidth="1.5">
      <line x1="64" y1="32" x2="64" y2="40" />
      <line x1="336" y1="32" x2="336" y2="40" />
    </g>
  </svg>
);

/** A parent with children — subtasks, epics. */
const Hierarchy = () => (
  <svg viewBox="0 0 400 96" className="w-full" role="presentation">
    <rect x="110" y="8" width="180" height="26" rx="8" className={INK} strokeWidth="1.5" />
    <g className={STROKE} strokeWidth="1.5" fill="none">
      <path d="M200 34 v14 M96 62 v-14 h208 v14" />
    </g>
    {[0, 1, 2].map((i) => (
      <rect key={i} x={26 + i * 118} y={62} width={104} height={26} rx="8" className={i === 0 ? INK_DONE : MUTED} strokeWidth="1.5" />
    ))}
  </svg>
);

/** A route between two pins — route tracking. */
const MapRoute = () => (
  <svg viewBox="0 0 400 92" className="w-full" role="presentation">
    <path
      d="M40 68 C 120 68, 110 22, 190 30 S 300 66, 360 26"
      className="stroke-primary/60" strokeWidth="2.5" fill="none" strokeDasharray="6 5" strokeLinecap="round"
    />
    {[[40, 68], [360, 26]].map(([cx, cy], i) => (
      <g key={i}>
        <circle cx={cx} cy={cy} r="9" className={i === 0 ? INK : INK_DONE} strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="3" className="fill-current opacity-50" />
      </g>
    ))}
  </svg>
);

/** Records filed on top of each other — documents, reports, assets, audit. */
const Stack = () => (
  <svg viewBox="0 0 400 92" className="w-full" role="presentation">
    {[0, 1, 2].map((i) => (
      <g key={i} opacity={1 - i * 0.28}>
        <rect x={112 + i * 12} y={12 + i * 20} width={176} height={44} rx="8" className={i === 0 ? INK : MUTED} strokeWidth="1.5" />
        <rect x={128 + i * 12} y={24 + i * 20} width={92} height={7} rx="3.5" className="fill-current opacity-30" />
        <rect x={128 + i * 12} y={37 + i * 20} width={56} height={7} rx="3.5" className="fill-current opacity-20" />
      </g>
    ))}
  </svg>
);

/** Two parties sharing one thing — CRM, portal, space sharing. */
const Split = () => (
  <svg viewBox="0 0 400 92" className="w-full" role="presentation">
    <rect x="12" y="26" width="130" height="40" rx="10" className={INK} strokeWidth="1.5" />
    <rect x="258" y="26" width="130" height="40" rx="10" className={INK_DONE} strokeWidth="1.5" />
    <g className={STROKE} strokeWidth="1.5" fill="none">
      <path d="M142 46 h116" />
    </g>
    <circle cx="200" cy="46" r="15" className="fill-background stroke-border" strokeWidth="1.5" />
    <path d="M194 46 h12 M200 40 v12" className="stroke-muted-foreground/60" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/** Items ticked off in order — checklists, custom fields. */
const Checklist = () => (
  <svg viewBox="0 0 400 92" className="w-full" role="presentation">
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x="88" y={10 + i * 26} width="18" height="18" rx="5" className={i < 2 ? INK_DONE : MUTED} strokeWidth="1.5" />
        {i < 2 && (
          <path d={`M92 ${19 + i * 26} l3.5 3.5 l6.5 -7`} className="stroke-emerald-600" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
        <rect x="118" y={15 + i * 26} width={194 - i * 40} height="8" rx="4" className="fill-current opacity-20" />
      </g>
    ))}
  </svg>
);

/** Figures rolled into a shape — reports, invoicing, points. */
const Chart = () => (
  <svg viewBox="0 0 400 92" className="w-full" role="presentation">
    <g className={STROKE} strokeWidth="1" opacity="0.5">
      {[24, 44, 64].map((y) => <line key={y} x1="40" y1={y} x2="368" y2={y} />)}
    </g>
    {[34, 52, 30, 64, 46, 74].map((h, i) => (
      <rect
        key={i} x={56 + i * 52} y={80 - h} width="30" height={h} rx="5"
        className={i === 5 ? INK_DONE : INK} strokeWidth="1.5"
      />
    ))}
  </svg>
);

const SHAPES: Record<DiagramId, () => ReactElement> = {
  flow: Flow,
  timeline: Timeline,
  hierarchy: Hierarchy,
  map: MapRoute,
  stack: Stack,
  split: Split,
  checklist: Checklist,
  chart: Chart,
};

/**
 * Renders the shape for a diagram id, with an optional caption from i18n.
 * Memoised because the shapes are static and the dialog re-renders on
 * translation load.
 */
export const ExplainerDiagram = memo(function ExplainerDiagram({
  id,
  caption,
}: {
  id: DiagramId;
  caption?: string;
}) {
  const Shape = SHAPES[id];
  if (!Shape) return null;
  return (
    <figure className="my-1 rounded-xl border border-border bg-muted/40 px-4 py-4">
      <Shape />
      {caption ? (
        <figcaption className="mt-2 text-center text-[11.5px] leading-snug text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
});
