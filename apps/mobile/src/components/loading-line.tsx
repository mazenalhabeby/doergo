import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { AText } from './amazen';

/**
 * "Loading…" as one line of a list or sheet — the caption a dozen screens wrote
 * out by hand, in the two looks they used (unchanged; the variants that differ
 * are listed in docs/design/ui-pieces/variants-phone.md).
 *
 * - default: a muted caption, as on a sheet (worklog, requests, time history).
 * - `onGlass`: centred on the glass ground, with `padUnits` × 4 px above and
 *   below when given (team, members, invitations, equipment, schedules…).
 */
export function LoadingLine({ onGlass = false, padUnits }: { onGlass?: boolean; padUnits?: number }) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const text = t('common.loading', 'Loading…');
  if (!onGlass) {
    return (
      <AText variant="caption" tone="muted">
        {text}
      </AText>
    );
  }
  return (
    <AText
      variant="caption"
      tone="onGlass"
      style={
        padUnits === undefined
          ? { textAlign: 'center' }
          : { textAlign: 'center', paddingVertical: amazen.space(padUnits) }
      }
    >
      {text}
    </AText>
  );
}
