#!/usr/bin/env node
/**
 * Writes packages/shared/src/icons/generated/solar-shell.ts — the Solar marks the app asks for by name, fetched
 * from Iconify (the same 24×24 bodies the Solar Figma file draws). Re-run after changing PICKS:
 *
 *     node tools/icons/solar.mjs
 *
 * Aliases are resolved (Iconify answers `magnifer-linear` as `magnifier-linear`), and `flip` mirrors a mark
 * (Solar's panel icons face right; our sidebar is on the left). A name that does not exist fails the run.
 * Solar by 480 Design, CC BY 4.0 — credited in the app's About/legal text.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Our name → the Solar id. Duotone (≥18px) for menu, top bar and actions; line (≤16px) for small controls. */
const PICKS = {
  // the menu
  home: 'home-2-bold-duotone',
  dashboard: 'widget-5-bold-duotone',
  inbox: 'inbox-bold-duotone',
  tasks: 'clipboard-list-bold-duotone',
  calendar: 'calendar-bold-duotone',
  time: 'clock-circle-bold-duotone',
  people: 'users-group-rounded-bold-duotone',
  idCard: 'user-id-bold-duotone',
  workspaces: 'buildings-2-bold-duotone',
  clients: 'case-minimalistic-bold-duotone',
  assets: 'box-bold-duotone',
  portals: 'smartphone-2-bold-duotone',
  documents: 'documents-bold-duotone',
  reports: 'pie-chart-2-bold-duotone',
  invoices: 'bill-list-bold-duotone',
  manage: 'tuning-2-bold-duotone',
  settings: 'settings-bold-duotone',
  // top bar and actions
  help: 'question-circle-bold-duotone',
  support: 'headphones-round-sound-bold-duotone',
  plus: 'add-circle-bold-duotone',
  language: 'translation-bold-duotone',
  moon: 'moon-bold-duotone',
  sun: 'sun-2-bold-duotone',
  user: 'user-rounded-bold-duotone',
  pin: 'map-point-bold-duotone',
  warning: 'danger-triangle-bold-duotone',
  sidebar: { id: 'panel-right-bold-duotone', flip: true },
  // the phone (2026-10-26): the tab bar draws a LINE mark, the active tab its filled twin; the More page and the
  // home shortcuts draw the destination's filled mark — the same names the web uses for the same pages
  dashboardLine: 'widget-5-linear',
  homeLine: 'home-2-linear',
  userLine: 'user-rounded-linear',
  tasksLine: 'clipboard-list-linear',
  timeLine: 'clock-circle-linear',
  peopleLine: 'users-group-rounded-linear',
  calendarLine: 'calendar-linear',
  plusLine: 'add-circle-linear',
  requests: 'calendar-add-bold-duotone',
  requestsLine: 'calendar-add-linear',
  moreDots: 'menu-dots-bold',
  attendance: 'checklist-minimalistic-bold-duotone',
  issues: 'flag-bold-duotone',
  schedule: 'sort-by-time-bold-duotone',
  sign: 'pen-new-round-bold-duotone',
  myEquipment: 'box-minimalistic-bold-duotone',
  sync: 'refresh-circle-bold-duotone',
  overtime: 'alarm-add-bold-duotone',
  expense: 'wallet-money-bold-duotone',
  scanCard: 'scanner-bold-duotone',
  route: 'routing-2-bold-duotone',
  equipmentLog: 'notebook-bold-duotone',
  extraTime: 'hourglass-bold-duotone',
  joinRequest: 'user-check-rounded-bold-duotone',
  invite: 'letter-bold-duotone',
  clientRequests: 'mailbox-bold-duotone',
  // the phone's controls and content marks (2026-10-26, replacing Ionicons) — line for controls, filled for things
  chevronUp: 'alt-arrow-up-linear',
  closeCircle: 'close-circle-bold',
  checkCircleLine: 'check-circle-linear',
  addLine: 'add-linear',
  refreshLine: 'refresh-linear',
  arrowRight: 'arrow-right-linear',
  arrowDown: 'arrow-down-linear',
  radioOn: 'record-circle-bold',
  radioOff: 'record-circle-linear',
  dot: 'record-bold',
  external: 'square-share-line-linear',
  link: 'link-round-linear',
  eye: 'eye-linear',
  eyeOff: 'eye-closed-linear',
  alert: 'danger-circle-bold-duotone',
  alertLine: 'danger-circle-linear',
  infoLine: 'info-circle-linear',
  removeLine: 'minus-circle-linear',
  resize: 'maximize-square-linear',
  lock: 'lock-keyhole-bold-duotone',
  key: 'key-bold-duotone',
  login: 'login-2-bold-duotone',
  camera: 'camera-bold-duotone',
  upload: 'cloud-upload-bold-duotone',
  offline: 'cloud-cross-bold-duotone',
  gps: 'gps-bold-duotone',
  navigate: 'map-arrow-up-bold-duotone',
  map: 'map-bold-duotone',
  car: 'car-bold-duotone',
  tools: 'sledgehammer-bold-duotone',
  timer: 'stopwatch-bold-duotone',
  alarm: 'alarm-bold-duotone',
  rest: 'cup-hot-bold-duotone',
  sparkles: 'magic-stick-3-bold-duotone',
  shield: 'shield-check-bold-duotone',
  smile: 'smile-circle-bold-duotone',
  folder: 'folder-bold-duotone',
  play: 'play-bold',
  flash: 'flashlight-on-bold',
  flashOff: 'flashlight-bold',
  list: 'list-bold-duotone',
  globe: 'global-bold-duotone',
  card: 'card-bold-duotone',
  medical: 'medical-kit-bold-duotone',
  school: 'square-academic-cap-bold-duotone',
  certificate: 'medal-ribbon-bold-duotone',
  tag: 'tag-bold-duotone',
  leaf: 'leaf-bold-duotone',
  water: 'waterdrop-bold-duotone',
  server: 'server-bold-duotone',
  bug: 'bug-bold-duotone',
  code: 'code-bold-duotone',
  branch: 'branching-paths-up-bold-duotone',
  hand: 'hand-shake-bold-duotone',
  signPen: 'pen-2-bold-duotone',
  // the client portal's request kinds (template keys → portal-ui.ts on the phone)
  snowflake: 'snowflake-bold-duotone',
  bolt: 'bolt-bold-duotone',
  door: 'login-3-bold-duotone',
  appliance: 'washing-machine-bold-duotone',
  shuffle: 'shuffle-bold-duotone',
  thermometer: 'thermometer-bold-duotone',
  bulb: 'lightbulb-bold-duotone',
  shower: 'bath-bold-duotone',
  shieldPlain: 'shield-bold-duotone',
  monitor: 'monitor-bold-duotone',
  toolbox: 'toolbox-bold-duotone',
  truck: 'delivery-bold-duotone',
  // the top bar's inbox group — line, as the design draws it
  inboxLine: 'inbox-linear',
  chatLine: 'chat-round-linear',
  bellLine: 'bell-linear',
  helpLine: 'question-circle-linear',
  supportLine: 'headphones-round-sound-linear',
  // small controls (line)
  selected: 'check-circle-bold',
  checkLine: 'unread-linear',
  checkRead: 'check-read-linear',
  chevronRight: 'alt-arrow-right-linear',
  chevronDown: 'alt-arrow-down-linear',
  chevronsUpDown: 'chevrons-up-down-linear',
  menu: 'hamburger-menu-linear',
  sidebarLine: { id: 'panel-right-linear', flip: true },
};

const pick = (v) => (typeof v === 'string' ? { id: v, flip: false } : v);
const ids = [...new Set(Object.values(PICKS).map((v) => pick(v).id))];
const res = await fetch(`https://api.iconify.design/solar.json?icons=${ids.join(',')}`);
if (!res.ok) throw new Error(`Iconify answered ${res.status}`);
const json = await res.json();
const body = (id) => {
  const icon = json.icons?.[id] ?? json.icons?.[json.aliases?.[id]?.parent];
  if (!icon) throw new Error(`solar:${id} does not exist`);
  return icon.body;
};
const lines = Object.entries(PICKS).map(([name, v]) => {
  const { id, flip } = pick(v);
  const markup = flip ? `<g transform="matrix(-1 0 0 1 24 0)">${body(id)}</g>` : body(id);
  return `  /** solar:${id}${flip ? ' (mirrored)' : ''} */\n  ${name}: ${JSON.stringify(markup)},`;
});
const out = join(dirname(fileURLToPath(import.meta.url)), '../../packages/shared/src/icons/generated/solar-shell.ts');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `// Generated by tools/icons/solar.mjs — do not edit by hand; change PICKS there and re-run.\n` +
    `// Solar by 480 Design (CC BY 4.0). Each value is the inner markup of a 24×24 icon in currentColor.\n` +
    `export const SOLAR_SHELL = {\n${lines.join('\n')}\n} as const;\n`,
);
console.log(`${Object.keys(PICKS).length} marks → ${out}`);
