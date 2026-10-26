import React from 'react';
import type { IconName } from '@hbcfield/shared/client';
import { InkIcon } from '@/components/amazen/ink-icon';

/**
 * The footer's marks — from the SHARED icon library, the same names the web sidebar uses for the same pages
 * (2026-10-26, phone-icons board): Home is the web's Dashboard, Jobs its Tasks, Time its Shifts & Attendance,
 * Team its Team Members.
 *
 * A tab you are not on is the LINE mark; the tab you are on is its FILLED twin (the pill stacks both and fades
 * the jade one in — `filled` is that layer). Line in a bar, filled for where you are: the web's top bar and
 * sidebar make the same pairing.
 *
 * ⚠️ `TAB_GLYPHS` is the one map, read by the pill AND the More page — Time off was once a calendar in two
 * different drawings depending on which door you came through.
 */
export interface TabGlyphProps {
  size?: number;
  color: string;
  /** The active layer: the filled twin. */
  filled?: boolean;
}

function tabMark(line: IconName, solid: IconName): React.ComponentType<TabGlyphProps> {
  const Mark = ({ size = 22, color, filled }: TabGlyphProps) => (
    <InkIcon name={filled ? solid : line} size={size} flat color={color} />
  );
  Mark.displayName = `Tab(${solid})`;
  return Mark;
}

/** The ••• — one drawing for both layers. */
export const TabMoreGlyph = tabMark('moreDots', 'moreDots');

export const TAB_GLYPHS: Record<string, React.ComponentType<TabGlyphProps>> = {
  index: tabMark('dashboardLine', 'dashboard'),
  tasks: tabMark('tasksLine', 'tasks'),
  attendance: tabMark('timeLine', 'time'),
  chat: tabMark('chatLine', 'chat'),
  'time-off': tabMark('requestsLine', 'requests'),
  team: tabMark('peopleLine', 'people'),
  'create-task': tabMark('plusLine', 'plus'),
  calendar: tabMark('calendarLine', 'calendar'),
};
