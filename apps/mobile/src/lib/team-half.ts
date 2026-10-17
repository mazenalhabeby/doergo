import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which half of the Team tab opens: People or Messages.
 *
 * Messages when something is unread (that is why the tab shows a number);
 * otherwise the half the person used last on this phone. Not sensitive — a
 * layout choice — so plain storage; every read falls back to People.
 */
export type TeamHalf = 'people' | 'messages';

const KEY = 'team_half_v1';
let remembered: TeamHalf | null = null;

export function isTeamHalf(v: unknown): v is TeamHalf {
  return v === 'people' || v === 'messages';
}

/** The half to open with: an explicit request (a link, a push) → unread → last used → People. */
export function openingHalf(asked: unknown, unread: number): TeamHalf {
  if (isTeamHalf(asked)) return asked;
  if (unread > 0) return 'messages';
  return remembered ?? 'people';
}

export async function loadTeamHalf(): Promise<TeamHalf | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (isTeamHalf(v)) remembered = v;
  } catch {
    /* falls back to People */
  }
  return remembered;
}

export function rememberTeamHalf(half: TeamHalf): void {
  remembered = half;
  AsyncStorage.setItem(KEY, half).catch(() => undefined);
}
