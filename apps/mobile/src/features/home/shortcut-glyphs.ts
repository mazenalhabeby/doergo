import type React from 'react';
import type { IconName } from '@hbcfield/shared/client';
import type { GlyphProps } from '@/components/glyphs/glyphs';
import { libGlyph } from '@/components/amazen/ink-icon';

/**
 * Each destination's mark, keyed by the table row's `labelKey` — from the SHARED icon library, the names the web
 * uses for the same pages (2026-10-26, phone-icons board). Drawn flat in the colour the screen passes.
 *
 * ⚠️ Here and not on the row: `manage-rows.ts` is read by the tab bar, and a table that imports every drawing in
 * the app is how a require cycle turns into a black screen (components/amazen/index.ts records one).
 * ⚠️ Every mark differs in OUTLINE — these sit side by side in one row of four (shortcut-glyphs.spec).
 */
const MARKS: Record<string, IconName> = {
  'shortcuts.documents': 'documents',
  'shortcuts.sign': 'sign',
  'shortcuts.myEquipment': 'myEquipment',
  'shortcuts.sync': 'sync',
  'shortcuts.overtime': 'overtime',
  'shortcuts.logExpense': 'expense',
  'shortcuts.newJob': 'plus',
  'shortcuts.scanCard': 'scanCard',
  'shortcuts.addClient': 'addUser',
  'shortcuts.planRoute': 'route',
  'shortcuts.support': 'support',
  'shortcuts.equipmentLog': 'equipmentLog',
  'manage.approvals.label': 'inbox',
  'manage.attendance.label': 'attendance',
  'manage.extraTime.label': 'extraTime',
  'manage.timeOff.label': 'requests',
  'manage.members.label': 'people',
  'manage.customers.label': 'clients',
  'manage.joinRequests.label': 'joinRequest',
  'manage.invitations.label': 'invite',
  'manage.schedules.label': 'schedule',
  'manage.issues.label': 'issues',
  'manage.equipment.label': 'assets',
  'manage.clientRequests.label': 'clientRequests',
};

export const SHORTCUT_MARKS: Readonly<Record<string, IconName>> = MARKS;

export const SHORTCUT_GLYPHS: Record<string, React.ComponentType<GlyphProps>> = Object.fromEntries(
  Object.entries(MARKS).map(([key, name]) => [key, libGlyph(name)]),
);
