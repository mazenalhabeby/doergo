import React from 'react';
import type { TFunction } from 'i18next';
import { AText, FilterPill, FilterRow } from './amazen';

/**
 * The workspace row above a list (equipment register, client requests): pills with "All
 * workspaces" first when there are several, the name alone when there is one, nothing otherwise.
 * A function, so the list header's tree is exactly what it was inline.
 */
export function workspaceFilter({
  spaces,
  spaceId,
  setSpaceId,
  t,
}: {
  spaces: { id: string; name: string }[];
  spaceId: string | null;
  setSpaceId: (id: string | null) => void;
  t: TFunction;
}) {
  return spaces.length > 1 ? (
    <FilterRow>
      {[{ id: null as string | null, name: t('register.allSpaces', 'All workspaces') }, ...spaces].map((s) => (
        <FilterPill key={s.id ?? 'all'} label={s.name} on={spaceId === s.id} onPress={() => setSpaceId(s.id)} />
      ))}
    </FilterRow>
  ) : spaces.length === 1 ? (
    <AText variant="caption" tone="onGlass">
      {spaces[0]!.name}
    </AText>
  ) : null;
}
