import { memo, type ReactElement } from 'react';

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

const W = 400;

/* ── shared atoms ─────────────────────────────────────────────────────────── */

const INK = 'fill-primary/12 stroke-primary/45';
const DONE = 'fill-emerald-500/15 stroke-emerald-500/50';
const WARN = 'fill-amber-500/15 stroke-amber-500/55';
const GHOST = 'fill-muted-foreground/10 stroke-muted-foreground/25';
const LINE = 'stroke-muted-foreground/40';
const TXT = 'fill-muted-foreground';

function Bar({ x, y, w, h = 6, o = 0.28 }: { x: number; y: number; w: number; h?: number; o?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} className="fill-current" opacity={o} />;
}

function Tick({ x, y }: { x: number; y: number }) {
  return (
    <path d={`M${x} ${y} l3 3.4 l6.5 -7`} className="stroke-emerald-500" strokeWidth="2.2"
      fill="none" strokeLinecap="round" strokeLinejoin="round" />
  );
}

function Arrow({ x, y, w = 20 }: { x: number; y: number; w?: number }) {
  return (
    <path d={`M${x} ${y} h${w - 5} m0 0 l-4 -3 m4 3 l-4 3`} className={LINE}
      strokeWidth="1.5" fill="none" strokeLinecap="round" />
  );
}

function Frame({ children, h = 100 }: { children: React.ReactNode; h?: number }) {
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full" role="presentation"
      fontFamily="Inter, system-ui, sans-serif">
      {children}
    </svg>
  );
}

/* ── task modules ─────────────────────────────────────────────────────────── */

const Subtasks = () => (
  <Frame h={104}>
    <rect x="70" y="8" width="260" height="30" rx="8" className={INK} strokeWidth="1.5" />
    <Bar x={84} y={17} w={110} />
    <rect x="238" y="19" width="76" height="7" rx="3.5" className="fill-muted-foreground/20" />
    <rect x="238" y="19" width="46" height="7" rx="3.5" className="fill-emerald-500/70" />
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x="100" y={48 + i * 18} width="12" height="12" rx="3.5" className={i < 2 ? DONE : GHOST} strokeWidth="1.4" />
        {i < 2 && <Tick x={102.5} y={54 + i * 18} />}
        <Bar x={122} y={51 + i * 18} w={150 - i * 26} h={5} />
      </g>
    ))}
    <path d="M84 40 v50" className={LINE} strokeWidth="1.2" opacity="0.45" />
  </Frame>
);

const Checklists = () => (
  <Frame h={98}>
    <rect x="108" y="8" width="184" height="82" rx="9" className={GHOST} strokeWidth="1.5" />
    {[0, 1, 2, 3].map((i) => (
      <g key={i}>
        <rect x="124" y={22 + i * 17} width="12" height="12" rx="3.5" className={i < 3 ? DONE : GHOST} strokeWidth="1.4" />
        {i < 3 && <Tick x={126.5} y={28 + i * 17} />}
        <Bar x={146} y={25 + i * 17} w={i === 3 ? 84 : 126 - i * 14} h={5} o={i === 3 ? 0.18 : 0.3} />
      </g>
    ))}
  </Frame>
);

const Attachments = () => (
  <Frame h={96}>
    <rect x="112" y="20" width="78" height="58" rx="8" className={INK} strokeWidth="1.5" />
    <circle cx="132" cy="38" r="5" className="fill-current" opacity="0.35" />
    <path d="M118 68 l16 -17 l12 12 l9 -8 l17 13 z" className="fill-current" opacity="0.3" />
    <rect x="210" y="14" width="62" height="70" rx="7" className={GHOST} strokeWidth="1.5" />
    {[0, 1, 2, 3].map((i) => <Bar key={i} x={222} y={28 + i * 12} w={i === 3 ? 22 : 38} h={5} />)}
    <path d="M300 34 v26 a11 11 0 0 1 -22 0 v-30 a7 7 0 0 1 14 0 v28 a3.5 3.5 0 0 1 -7 0 v-24"
      className="stroke-primary/70" strokeWidth="2" fill="none" strokeLinecap="round" />
  </Frame>
);

const Dependencies = () => (
  <Frame h={92}>
    <rect x="34" y="30" width="130" height="34" rx="9" className={DONE} strokeWidth="1.5" />
    <Bar x={50} y={41} w={74} />
    <Tick x={140} y={44} />
    <Arrow x={174} y={47} w={34} />
    <rect x="222" y="30" width="130" height="34" rx="9" className={GHOST} strokeWidth="1.5" strokeDasharray="4 3" />
    <Bar x={238} y={41} w={62} o={0.18} />
    <rect x="318" y="39" width="16" height="12" rx="2.5" className="fill-amber-500/25 stroke-amber-500/60" strokeWidth="1.2" />
    <path d="M323 39 v-4 a3 3 0 0 1 6 0 v4" className="stroke-amber-500/70" strokeWidth="1.5" fill="none" />
  </Frame>
);

const CustomFields = () => (
  <Frame h={100}>
    <rect x="96" y="8" width="208" height="84" rx="9" className={GHOST} strokeWidth="1.5" />
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <Bar x={110} y={22 + i * 24} w={44} h={5} o={0.35} />
        <rect x="110" y={31 + i * 24} width="180" height="14" rx="4" className={i === 0 ? INK : GHOST} strokeWidth="1.2" />
        {i === 0 && <Bar x={118} y={35} w={58} h={5} o={0.4} />}
      </g>
    ))}
  </Frame>
);

/* ── field modules ────────────────────────────────────────────────────────── */

const Tracking = () => (
  <Frame h={98}>
    <rect x="16" y="8" width="368" height="82" rx="10" className={GHOST} strokeWidth="1.2" />
    <path d="M60 74 C 130 74, 118 30, 196 38 S 306 72, 348 30"
      className="stroke-primary/70" strokeWidth="2.5" fill="none" strokeDasharray="7 5" strokeLinecap="round" />
    <circle cx="60" cy="74" r="8" className={INK} strokeWidth="1.5" />
    <path d="M348 18 a10 10 0 0 1 10 10 c0 7 -10 16 -10 16 s-10 -9 -10 -16 a10 10 0 0 1 10 -10z"
      className="fill-emerald-500/25 stroke-emerald-500/60" strokeWidth="1.5" />
    <circle cx="348" cy="28" r="3.5" className="fill-emerald-500/80" />
    <rect x="168" y="62" width="62" height="18" rx="9" className="fill-background stroke-border" strokeWidth="1.2" />
    <text x="199" y="74.5" textAnchor="middle" fontSize="10.5" fontWeight="600" className={TXT}>24 km</text>
  </Frame>
);

const ServiceReports = () => (
  <Frame h={104}>
    <rect x="112" y="6" width="176" height="92" rx="9" className={GHOST} strokeWidth="1.5" />
    {[0, 1, 2].map((i) => <Bar key={i} x={128} y={20 + i * 12} w={i === 2 ? 86 : 142} h={5} />)}
    <line x1="128" y1="62" x2="272" y2="62" className={LINE} strokeWidth="1" strokeDasharray="3 3" />
    <path d="M136 82 c 10 -16, 20 6, 30 -8 s 16 12, 26 -2 s 14 8, 22 -4"
      className="stroke-primary/80" strokeWidth="2" fill="none" strokeLinecap="round" />
    <line x1="128" y1="90" x2="272" y2="90" className={LINE} strokeWidth="1.2" />
  </Frame>
);

const TimeTracking = () => (
  <Frame h={106}>
    <text x="18" y="20" fontSize="9.5" fontWeight="600" className={TXT} opacity="0.75">07:42</text>
    <rect x="18" y="26" width="330" height="16" rx="6" className={GHOST} strokeWidth="1.4" />
    <text x="352" y="38" fontSize="9.5" fontWeight="600" className={TXT} opacity="0.75">16:20</text>
    {/* The rect must come FIRST: drawn after, it painted over the label and the
        planned start simply vanished. SVG has no z-index — order is the order. */}
    <rect x="64" y="52" width="248" height="16" rx="6" className={INK} strokeWidth="1.4" />
    <text x="72" y="64" fontSize="9.5" fontWeight="700" className="fill-primary">08:00</text>
    <text x="304" y="64" textAnchor="end" fontSize="9.5" fontWeight="700" className="fill-primary">16:00</text>
    <rect x="64" y="78" width="104" height="12" rx="4" className="fill-emerald-500/75" />
    <rect x="168" y="78" width="22" height="12" rx="3" className="fill-amber-500/70" />
    <rect x="190" y="78" width="122" height="12" rx="4" className="fill-emerald-500/75" />
    <text x="322" y="88" fontSize="10" fontWeight="700" className="fill-emerald-600 dark:fill-emerald-400">7h30</text>
    <g className={LINE} strokeWidth="1.2" strokeDasharray="3 3">
      <line x1="64" y1="42" x2="64" y2="52" /><line x1="312" y1="42" x2="312" y2="52" />
    </g>
  </Frame>
);

const Assets = () => (
  <Frame h={102}>
    <rect x="30" y="16" width="104" height="70" rx="9" className={INK} strokeWidth="1.5" />
    <path d="M62 62 l20 -22 l20 22 z" className="fill-current" opacity="0.3" />
    <circle cx="82" cy="36" r="6" className="fill-current" opacity="0.25" />
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <circle cx="168" cy={28 + i * 22} r="4" className={i === 0 ? 'fill-emerald-500/80' : 'fill-muted-foreground/35'} />
        {i < 2 && <line x1="168" y1={32 + i * 22} x2="168" y2={46 + i * 22} className={LINE} strokeWidth="1.2" />}
        <Bar x={182} y={25 + i * 22} w={150 - i * 30} h={5} o={i === 0 ? 0.34 : 0.2} />
        <Bar x={182} y={34 + i * 22} w={70 - i * 10} h={4} o={0.14} />
      </g>
    ))}
  </Frame>
);

/* ── agile modules ────────────────────────────────────────────────────────── */

const Sprints = () => (
  <Frame h={98}>
    <rect x="24" y="14" width="352" height="20" rx="6" className={GHOST} strokeWidth="1.3" />
    <rect x="24" y="14" width="220" height="20" rx="6" className={INK} strokeWidth="1.3" />
    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
      <line key={i} x1={68 + i * 44} y1="14" x2={68 + i * 44} y2="34" className={LINE} strokeWidth="1" opacity="0.5" />
    ))}
    <path d="M28 50 L112 58 L196 70 L280 76 L364 88" className="stroke-emerald-500/80" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {[[28, 50], [112, 58], [196, 70], [280, 76], [364, 88]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="3" className="fill-emerald-500" />
    ))}
  </Frame>
);

const StoryPoints = () => (
  <Frame h={96}>
    {[3, 5, 8].map((n, i) => (
      <g key={n}>
        <rect x={54 + i * 78} y="22" width="58" height="52" rx="9" className={INK} strokeWidth="1.5" />
        <text x={83 + i * 78} y="55" textAnchor="middle" fontSize="21" fontWeight="700" className="fill-primary">{n}</text>
      </g>
    ))}
    <text x="300" y="55" textAnchor="middle" fontSize="15" className={TXT} opacity="0.6">=</text>
    <rect x="322" y="22" width="62" height="52" rx="9" className={DONE} strokeWidth="1.5" />
    <text x="353" y="55" textAnchor="middle" fontSize="21" fontWeight="700" className="fill-emerald-600 dark:fill-emerald-400">16</text>
  </Frame>
);

const Epics = () => (
  <Frame h={100}>
    <rect x="42" y="12" width="316" height="26" rx="8" className={INK} strokeWidth="1.5" />
    <rect x="52" y="20" width="296" height="10" rx="5" className="fill-muted-foreground/20" />
    <rect x="52" y="20" width="178" height="10" rx="5" className="fill-emerald-500/75" />
    <text x="362" y="29" fontSize="10" fontWeight="700" className="fill-emerald-600 dark:fill-emerald-400">60%</text>
    {[0, 1, 2, 3].map((i) => (
      <g key={i}>
        <path d={`M${74 + i * 84} 62 v-16`} className={LINE} strokeWidth="1.2" opacity="0.55" />
        <rect x={40 + i * 84} y="62" width="68" height="26" rx="7" className={i < 2 ? DONE : GHOST} strokeWidth="1.4" />
        <Bar x={52 + i * 84} y={72} w={44 - i * 4} h={5} o={0.3} />
      </g>
    ))}
  </Frame>
);

const Phases = () => (
  <Frame h={80}>
    {[0, 1, 2, 3].map((i) => {
      const x = 14 + i * 96;
      const cls = i < 2 ? DONE : i === 2 ? INK : GHOST;
      return (
        <g key={i}>
          <path d={`M${x} 24 h72 l14 16 l-14 16 h-72 l14 -16 z`} className={cls} strokeWidth="1.5" />
          <Bar x={x + 24} y={37} w={38} h={6} o={i === 2 ? 0.4 : 0.22} />
        </g>
      );
    })}
  </Frame>
);

/* ── client modules ───────────────────────────────────────────────────────── */

const Crm = () => (
  <Frame h={100}>
    <rect x="36" y="18" width="112" height="66" rx="9" className={INK} strokeWidth="1.5" />
    {[0, 1, 2].map((r) => [0, 1].map((c) => (
      <rect key={`${r}-${c}`} x={56 + c * 30} y={32 + r * 16} width="18" height="10" rx="2.5" className="fill-current" opacity="0.22" />
    )))}
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <line x1="148" y1="51" x2="196" y2={26 + i * 25} className={LINE} strokeWidth="1.2" opacity="0.55" />
        <circle cx="210" cy={26 + i * 25} r="11" className={i === 0 ? DONE : GHOST} strokeWidth="1.4" />
        <circle cx="210" cy={22 + i * 25} r="3.4" className="fill-current" opacity="0.4" />
        <path d={`M204 ${33 + i * 25} a6.5 6.5 0 0 1 12 0`} className="fill-current" opacity="0.4" />
        <Bar x={230} y={22 + i * 25} w={112 - i * 22} h={5} o={0.24} />
      </g>
    ))}
  </Frame>
);

const B2cPortal = () => (
  <Frame h={100}>
    <rect x="34" y="16" width="86" height="70" rx="11" className={INK} strokeWidth="1.5" />
    <rect x="46" y="30" width="62" height="8" rx="4" className="fill-current" opacity="0.3" />
    <rect x="46" y="44" width="62" height="22" rx="5" className="fill-current" opacity="0.14" />
    <rect x="58" y="72" width="38" height="6" rx="3" className="fill-primary/60" />
    <Arrow x={132} y={51} w={44} />
    <rect x="196" y="10" width="170" height="82" rx="9" className={GHOST} strokeWidth="1.4" />
    {[0, 1, 2].map((i) => (
      <rect key={i} x={208 + i * 52} y="22" width="42" height="58" rx="6"
        className={i === 0 ? DONE : 'fill-muted-foreground/8 stroke-muted-foreground/20'} strokeWidth="1.2" />
    ))}
    <Bar x={216} y={32} w={26} h={5} o={0.35} />
  </Frame>
);

const SpaceSharing = () => (
  <Frame h={96}>
    <circle cx="74" cy="48" r="28" className={INK} strokeWidth="1.6" />
    <circle cx="326" cy="48" r="28" className={DONE} strokeWidth="1.6" />
    <rect x="140" y="30" width="120" height="36" rx="9" className={GHOST} strokeWidth="1.5" />
    <Bar x={158} y={40} w={64} />
    <Bar x={158} y={52} w={40} o={0.16} />
    <g className={LINE} strokeWidth="1.5" strokeDasharray="4 3">
      <line x1="102" y1="48" x2="140" y2="48" /><line x1="260" y1="48" x2="298" y2="48" />
    </g>
    <path d="M66 44 a8 8 0 1 1 16 0 M62 62 a12 12 0 0 1 24 0" className="stroke-primary/60" strokeWidth="1.6" fill="none" />
    <path d="M318 44 a8 8 0 1 1 16 0 M314 62 a12 12 0 0 1 24 0" className="stroke-emerald-500/60" strokeWidth="1.6" fill="none" />
  </Frame>
);

/* ── options ──────────────────────────────────────────────────────────────── */

const Workflows = () => (
  <Frame h={96}>
    {[0, 1, 2, 3].map((i) => (
      <g key={i}>
        <rect x={10 + i * 100} y="46" width="76" height="28" rx="14" className={i === 3 ? DONE : INK} strokeWidth="1.5" />
        <circle cx={26 + i * 100} cy="60" r="4" className={i === 3 ? 'fill-emerald-500' : 'fill-primary'} opacity="0.8" />
        <Bar x={38 + i * 100} y={57} w={36} h={5} o={0.3} />
        {i < 3 && <Arrow x={90 + i * 100} y={60} />}
      </g>
    ))}
    <path d="M186 46 v-12 h48 v12" className="stroke-amber-500/60" strokeWidth="1.5" fill="none" strokeDasharray="4 3" />
    <rect x="180" y="12" width="60" height="22" rx="11" className={WARN} strokeWidth="1.4" />
  </Frame>
);

const Recurring = () => (
  <Frame h={100}>
    <rect x="70" y="10" width="260" height="82" rx="9" className={GHOST} strokeWidth="1.4" />
    <line x1="70" y1="30" x2="330" y2="30" className={LINE} strokeWidth="1.2" />
    <circle cx="93" cy="20" r="3" className="fill-current" opacity="0.3" />
    <circle cx="307" cy="20" r="3" className="fill-current" opacity="0.3" />
    {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5, 6].map((c) => (
      <rect key={`${r}-${c}`} x={82 + c * 35} y={40 + r * 13} width="22" height="8" rx="3"
        className={c === 2 ? 'fill-primary/70' : 'fill-muted-foreground/15'} />
    )))}
  </Frame>
);

const ShiftScheduling = () => (
  <Frame h={100}>
    {[0, 1, 2, 3, 4].map((c) => (
      <line key={c} x1={92 + c * 60} y1="12" x2={92 + c * 60} y2="92" className={LINE} strokeWidth="1" opacity="0.4" />
    ))}
    {([[0, 0, 2], [1, 1, 2], [2, 0, 3], [3, 2, 2]] as const).map(([r, s, len], i) => (
      <g key={i}>
        <circle cx="42" cy={26 + r * 20} r="8" className={GHOST} strokeWidth="1.3" />
        <rect x={70 + s * 60} y={20 + r * 20} width={len * 60 - 8} height="13" rx="4"
          className={i === 1 ? 'fill-emerald-500/60' : 'fill-primary/50'} />
      </g>
    ))}
  </Frame>
);

const Overtime = () => (
  <Frame h={92}>
    <rect x="30" y="34" width="200" height="20" rx="6" className={INK} strokeWidth="1.4" />
    <rect x="230" y="34" width="66" height="20" rx="6" className={WARN} strokeWidth="1.4" strokeDasharray="4 3" />
    <Arrow x={306} y={44} w={24} />
    <circle cx="356" cy="44" r="17" className={DONE} strokeWidth="1.6" />
    <Tick x={349} y={43} />
    <path d="M30 70 c 12 -12, 22 6, 34 -6 s 16 10, 26 -2" className="stroke-primary/60" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  </Frame>
);

const Invoicing = () => (
  <Frame h={104}>
    <rect x="112" y="6" width="176" height="92" rx="9" className={GHOST} strokeWidth="1.5" />
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <Bar x={128} y={22 + i * 15} w={92} h={5} />
        <Bar x={238} y={22 + i * 15} w={34} h={5} o={0.35} />
      </g>
    ))}
    <line x1="128" y1="74" x2="272" y2="74" className={LINE} strokeWidth="1.2" />
    <text x="130" y="90" fontSize="14" fontWeight="700" className="fill-primary">€</text>
    <rect x="212" y="81" width="60" height="9" rx="4.5" className="fill-emerald-500/70" />
  </Frame>
);

const ReportsBuilder = () => (
  <Frame h={100}>
    <rect x="20" y="14" width="104" height="74" rx="9" className={GHOST} strokeWidth="1.4" />
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x="32" y={26 + i * 20} width="12" height="12" rx="3.5" className={i < 2 ? DONE : GHOST} strokeWidth="1.3" />
        {i < 2 && <Tick x={34.5} y={32 + i * 20} />}
        <Bar x={52} y={29 + i * 20} w={58 - i * 12} h={5} />
      </g>
    ))}
    <Arrow x={134} y={50} w={28} />
    <g className={LINE} strokeWidth="1" opacity="0.45">
      <line x1="180" y1="34" x2="384" y2="34" /><line x1="180" y1="54" x2="384" y2="54" /><line x1="180" y1="74" x2="384" y2="74" />
    </g>
    {[30, 48, 26, 60, 42].map((h, i) => (
      <rect key={i} x={190 + i * 40} y={80 - h} width="26" height={h} rx="5" className={i === 3 ? DONE : INK} strokeWidth="1.4" />
    ))}
  </Frame>
);

const ReportScheduling = () => (
  <Frame h={96}>
    <rect x="112" y="14" width="128" height="74" rx="9" className={INK} strokeWidth="1.5" />
    <path d="M112 20 l64 44 l64 -44" className="stroke-primary/55" strokeWidth="1.8" fill="none" />
    <circle cx="292" cy="62" r="22" className="fill-background stroke-border" strokeWidth="1.4" />
    <circle cx="292" cy="62" r="18" className={DONE} strokeWidth="1.4" />
    <path d="M292 51 v12 l8 5" className="stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M330 40 a24 24 0 1 0 -12 -20" className="stroke-primary/50" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <path d="M312 16 l10 4 l-8 7 z" className="fill-primary/60" />
  </Frame>
);

const AuditLog = () => (
  <Frame h={100}>
    {[0, 1, 2, 3].map((i) => (
      <g key={i} opacity={1 - i * 0.16}>
        <circle cx="66" cy={20 + i * 22} r="9" className={i === 0 ? INK : GHOST} strokeWidth="1.3" />
        <circle cx="66" cy={17 + i * 22} r="2.8" className="fill-current" opacity="0.4" />
        <path d={`M61 ${25 + i * 22} a5.5 5.5 0 0 1 10 0`} className="fill-current" opacity="0.4" />
        <Bar x={86} y={16 + i * 22} w={168 - i * 24} h={5} o={0.3} />
        <Bar x={86} y={25 + i * 22} w={92 - i * 12} h={4} o={0.15} />
        <rect x="300" y={14 + i * 22} width="54" height="12" rx="6" className="fill-muted-foreground/12" />
        <text x="327" y={23 + i * 22} textAnchor="middle" fontSize="8" className={TXT} opacity="0.7">
          {['09:14', '09:02', '08:47', '08:31'][i]}
        </text>
      </g>
    ))}
  </Frame>
);

const Documents = () => (
  <Frame h={104}>
    <rect x="118" y="6" width="164" height="92" rx="9" className={GHOST} strokeWidth="1.5" />
    {[0, 1, 2].map((i) => <Bar key={i} x={134} y={20 + i * 12} w={i === 2 ? 74 : 130} h={5} />)}
    <line x1="134" y1="66" x2="266" y2="66" className={LINE} strokeWidth="1" strokeDasharray="3 3" />
    <path d="M140 84 c 10 -14, 20 5, 30 -7 s 15 11, 24 -2" className="stroke-primary/80" strokeWidth="2" fill="none" strokeLinecap="round" />
    <circle cx="294" cy="24" r="17" className={WARN} strokeWidth="1.5" />
    <path d="M294 15 v10 l6 4" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2" fill="none" strokeLinecap="round" />
  </Frame>
);

const PriorityRouting = () => (
  <Frame h={96}>
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x={148 + i * 62} y="52" width="52" height="30" rx="7" className={GHOST} strokeWidth="1.3" />
    ))}
    <rect x="30" y="52" width="78" height="30" rx="7" className={DONE} strokeWidth="1.6" />
    <Bar x={44} y={64} w={50} o={0.35} />
    <path d="M250 42 C 210 18, 120 18, 78 42" className="stroke-emerald-500/70" strokeWidth="2" fill="none" strokeDasharray="5 4" strokeLinecap="round" />
    <path d="M78 42 l10 -5 l-1 9 z" className="fill-emerald-500/80" />
  </Frame>
);

const LiveChat = () => (
  <Frame h={96}>
    <path d="M52 16 h150 a9 9 0 0 1 9 9 v26 a9 9 0 0 1 -9 9 h-118 l-18 14 v-14 h-14 a9 9 0 0 1 -9 -9 v-26 a9 9 0 0 1 9 -9z"
      className={GHOST} strokeWidth="1.5" />
    <Bar x={60} y={28} w={116} /><Bar x={60} y={40} w={78} o={0.18} />
    <path d="M348 44 h-136 a9 9 0 0 0 -9 9 v22 a9 9 0 0 0 9 9 h104 l18 12 v-12 h14 a9 9 0 0 0 9 -9 v-22 a9 9 0 0 0 -9 -9z"
      className={INK} strokeWidth="1.5" />
    {[0, 1, 2].map((i) => (
      <circle key={i} cx={232 + i * 16} cy="64" r="4" className="fill-primary" opacity={0.75 - i * 0.2} />
    ))}
  </Frame>
);

const DedicatedSupport = () => (
  <Frame h={96}>
    <circle cx="128" cy="48" r="30" className={INK} strokeWidth="1.7" />
    <circle cx="128" cy="40" r="9" className="fill-current" opacity="0.35" />
    <path d="M110 68 a18 18 0 0 1 36 0" className="fill-current" opacity="0.35" />
    <circle cx="151" cy="26" r="10" className="fill-emerald-500/85" />
    <Tick x={146} y={25} />
    <line x1="166" y1="48" x2="228" y2="48" className={LINE} strokeWidth="1.5" strokeDasharray="4 3" />
    <rect x="238" y="26" width="128" height="44" rx="10" className={GHOST} strokeWidth="1.4" />
    <Bar x={254} y={38} w={96} /><Bar x={254} y={50} w={58} o={0.18} />
  </Frame>
);

/* ── lookup ───────────────────────────────────────────────────────────────── */

const DIAGRAMS: Record<string, () => ReactElement> = {
  subtasks: Subtasks, checklists: Checklists, attachments: Attachments,
  dependencies: Dependencies, custom_fields: CustomFields, tracking: Tracking,
  service_reports: ServiceReports, time_tracking: TimeTracking, assets: Assets,
  sprints: Sprints, story_points: StoryPoints, epics: Epics, phases: Phases,
  crm: Crm, b2c_portal: B2cPortal, space_sharing: SpaceSharing,
  workflows: Workflows, recurring: Recurring, shift_scheduling: ShiftScheduling,
  overtime: Overtime, invoicing: Invoicing, reports_builder: ReportsBuilder,
  report_scheduling: ReportScheduling, audit_log: AuditLog, documents: Documents,
  priority_routing: PriorityRouting, live_chat: LiveChat, dedicated_support: DedicatedSupport,
};

/** Which keys have a picture. Read by the guard test. */
export const DIAGRAM_KEYS: readonly string[] = Object.keys(DIAGRAMS);

export function hasDiagram(key: string): boolean {
  return key in DIAGRAMS;
}

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
