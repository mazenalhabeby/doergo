import { type ReactElement } from 'react';
import {
  INK,
  DONE,
  WARN,
  GHOST,
  LINE,
  TXT,
  Bar,
  Tick,
  Arrow,
  Frame,
  Subtasks,
  Checklists,
  Attachments,
  Dependencies,
  CustomFields,
  Tracking,
  ServiceReports,
  TimeTracking,
  Assets,
  Sprints,
  StoryPoints,
  Epics,
  Phases,
  Crm,
  B2cPortal,
} from './time-tracking';

export const SpaceSharing = () => (
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

export const Workflows = () => (
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

export const Recurring = () => (
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

export const ShiftScheduling = () => (
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

export const Overtime = () => (
  <Frame h={92}>
    <rect x="30" y="34" width="200" height="20" rx="6" className={INK} strokeWidth="1.4" />
    <rect x="230" y="34" width="66" height="20" rx="6" className={WARN} strokeWidth="1.4" strokeDasharray="4 3" />
    <Arrow x={306} y={44} w={24} />
    <circle cx="356" cy="44" r="17" className={DONE} strokeWidth="1.6" />
    <Tick x={349} y={43} />
    <path
      d="M30 70 c 12 -12, 22 6, 34 -6 s 16 10, 26 -2"
      className="stroke-primary/60"
      strokeWidth="1.8"
      fill="none"
      strokeLinecap="round"
    />
  </Frame>
);

export const Invoicing = () => (
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

export const ReportsBuilder = () => (
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

export const ReportScheduling = () => (
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

export const AuditLog = () => (
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

export const Documents = () => (
  <Frame h={104}>
    <rect x="118" y="6" width="164" height="92" rx="9" className={GHOST} strokeWidth="1.5" />
    {[0, 1, 2].map((i) => <Bar key={i} x={134} y={20 + i * 12} w={i === 2 ? 74 : 130} h={5} />)}
    <line x1="134" y1="66" x2="266" y2="66" className={LINE} strokeWidth="1" strokeDasharray="3 3" />
    <path
      d="M140 84 c 10 -14, 20 5, 30 -7 s 15 11, 24 -2"
      className="stroke-primary/80"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
    <circle cx="294" cy="24" r="17" className={WARN} strokeWidth="1.5" />
    <path d="M294 15 v10 l6 4" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2" fill="none" strokeLinecap="round" />
  </Frame>
);

export const PriorityRouting = () => (
  <Frame h={96}>
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x={148 + i * 62} y="52" width="52" height="30" rx="7" className={GHOST} strokeWidth="1.3" />
    ))}
    <rect x="30" y="52" width="78" height="30" rx="7" className={DONE} strokeWidth="1.6" />
    <Bar x={44} y={64} w={50} o={0.35} />
    <path
      d="M250 42 C 210 18, 120 18, 78 42"
      className="stroke-emerald-500/70"
      strokeWidth="2"
      fill="none"
      strokeDasharray="5 4"
      strokeLinecap="round"
    />
    <path d="M78 42 l10 -5 l-1 9 z" className="fill-emerald-500/80" />
  </Frame>
);

export const LiveChat = () => (
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

export const DedicatedSupport = () => (
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

export const DIAGRAMS: Record<string, () => ReactElement> = {
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
