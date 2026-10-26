import { View, Text } from 'react-native';
import { Icon } from '@/components/amazen/ink-icon';
import { useTranslation } from 'react-i18next';
import { formatCalendarDate } from '@hbcfield/shared/client';
import type { DocumentType } from '@/lib/api/documents';
import type { AskType, AskedRow, typeGroups } from '@/lib/document-asks';
import { documentTypeIcon } from '@/lib/document-icons';
import { PressableScale } from '@/components/pressable-scale';
import { s, useSupplyPalette } from './styles';
import { toneColor, toneTint } from '@/theme/tone-color';

/**
 * "Contract for a vehicle or equipment" — the one thing a member hands in that
 * is not a document of THEIRS. Leaves the sheet for the contract camera.
 */
export function OfficeRow({ onContract }: { onContract: () => void }) {
  const { t } = useTranslation();
  const { colors } = useSupplyPalette();
  return (
    <>
      <Text style={[s.eyebrow, { color: colors.textMuted }]}>{t('documents.supply.forOffice', 'For the office')}</Text>
      <PressableScale
        onPress={onContract}
        accessibilityRole="button"
        style={[s.typeRow, { backgroundColor: colors.surfaceRaised }]}
      >
        <View style={[s.typeIcon, { backgroundColor: colors.surface }]}>
          <Icon name="car" size={19} color={colors.textSecondary} />
        </View>
        <View style={s.typeText}>
          <Text style={[s.typeLabel, { color: colors.textPrimary }]} numberOfLines={1}>
            {t('documents.supply.contract', 'Contract for a vehicle or equipment')}
          </Text>
          <Text style={[s.typeHint, { color: colors.textMuted }]} numberOfLines={1}>
            {t('documents.supply.contractHint', 'Rental, leasing or purchase — the office adds it')}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={colors.textMuted} />
      </PressableScale>
    </>
  );
}

/**
 * "What is it?", sorted by what is asked of the member — `document-asks`, the
 * same rule as the Still needed card. Being checked is shown and not offered;
 * approved and valid is left out.
 */
export function TypeChooser({
  groups,
  selectedId,
  onChoose,
}: {
  groups: ReturnType<typeof typeGroups>;
  selectedId: string | undefined;
  onChoose: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { a, colors } = useSupplyPalette();

  const askedLine = (row: AskedRow) => {
    if (row.why === 'sentBack')
      return row.reason
        ? t('documents.supply.sentBackWhy', { reason: row.reason, defaultValue: 'Sent back · {{reason}}' })
        : t('documents.required.state.REJECTED');
    if (row.why === 'expired') return t('documents.required.state.EXPIRED');
    if (row.why === 'expiring')
      return row.expiresOn
        ? t('documents.supply.expiringOn', {
            date: formatCalendarDate(row.expiresOn.slice(0, 10)),
            defaultValue: 'Expires {{date}} · send the renewed one',
          })
        : t('documents.required.state.EXPIRING');
    return t('documents.supply.askedMissing', 'Asked for · not sent yet');
  };

  /* One row of "What is it?" — every row the same height, whatever its description. */
  const typeRow = (ty: AskType, sub: string | null, o: { tone?: 'warn' | 'crit'; off?: boolean } = {}) => {
    const full = ty as DocumentType;
    const on = !o.off && ty.id === selectedId;
    const hint = toneColor(a, o.tone, colors.textMuted);
    return (
      <PressableScale
        key={ty.id}
        onPress={() => onChoose(ty.id)}
        disabled={o.off}
        accessibilityRole="radio"
        accessibilityState={{ selected: on, disabled: !!o.off }}
        style={[
          s.typeRow,
          on
            ? { backgroundColor: a.accentTint, borderWidth: 1.5, borderColor: a.accent }
            : { backgroundColor: colors.surfaceRaised },
          o.off && { opacity: 0.6 },
        ]}
      >
        <View style={[s.typeIcon, { backgroundColor: toneTint(a, o.tone, colors.surface) }]}>
          <Icon
            name={o.off ? 'time' : o.tone ? 'addLine' : documentTypeIcon(full.key)}
            size={19}
            color={o.tone === 'crit' ? a.critical : o.tone === 'warn' ? a.warn : on ? a.accent : colors.textSecondary}
          />
        </View>
        <View style={s.typeText}>
          <Text style={[s.typeLabel, { color: on ? a.accent : colors.textPrimary }]} numberOfLines={1}>
            {ty.label}
          </Text>
          {sub ? (
            <Text style={[s.typeHint, { color: hint }]} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        {on && <Icon name="selected" size={20} color={a.accent} />}
      </PressableScale>
    );
  };

  return (
    <>
      {/*
        What it is.

        Every row the SAME HEIGHT, whether or not the type carries a
        description. A list where one option is twice as tall as its
        neighbours because somebody wrote two sentences about it reads as
        an accident, and the tall one draws the eye for no reason that has
        anything to do with what it is.
      */}
      <Text style={[s.eyebrow, { color: colors.textMuted }]}>{t('documents.supply.whatIsIt')}</Text>
      {groups.asked.length ? (
        <Text style={[s.eyebrow, { color: a.warn, marginTop: 0 }]}>
          {t('documents.supply.groupAsked', { count: groups.asked.length, defaultValue: 'Asked for · {{count}}' })}
        </Text>
      ) : null}
      <View style={s.typeList}>
        {groups.asked.map((row) =>
          typeRow(row.type, askedLine(row), {
            tone: row.why === 'sentBack' || row.why === 'expired' ? 'crit' : 'warn',
          }),
        )}
      </View>
      {groups.checking.length ? (
        <>
          <Text style={[s.eyebrow, { color: colors.textMuted }]}>
            {t('documents.supply.groupChecking', 'Being checked')}
          </Text>
          <View style={s.typeList}>
            {groups.checking.map((row) =>
              typeRow(
                row.type,
                row.onPhone
                  ? t('documents.supply.onPhone', 'On this phone · sends when you are online')
                  : t('documents.supply.checking', 'Sent · the office is checking it'),
                { off: true },
              ),
            )}
          </View>
        </>
      ) : null}
      {groups.other.length ? (
        <>
          {groups.asked.length || groups.checking.length ? (
            <Text style={[s.eyebrow, { color: colors.textMuted }]}>
              {t('documents.supply.groupOther', 'Something else')}
            </Text>
          ) : null}
          <View style={s.typeList}>{groups.other.map((ty) => typeRow(ty, ty.description ?? null))}</View>
        </>
      ) : null}
    </>
  );
}
