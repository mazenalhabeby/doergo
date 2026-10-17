import React from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { AText, Eyebrow, FilterPill, FilterRow, GlassCard, PrimaryButton, Well, WellDivider } from '../../amazen';
import type { CrmSpace } from '../../../hooks/use-crm-spaces';
import type { ImportFields, useContactsImport } from './use-contacts-import';

/**
 * Check before import — what WILL happen, said before it does.
 *
 * The numbers here are the phone's reading; the server decides again and the
 * done screen reports what it actually did. They differ only when the book
 * changed on the server in between, and then the server is right.
 */
export function ReviewStep({
  state, spaces, spaceId, onSpace, onImport,
}: {
  state: ReturnType<typeof useContactsImport>;
  spaces: CrmSpace[];
  spaceId: string | null;
  onSpace: (id: string) => void;
  onImport: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { summary, fields, setFields, fillMissing, setFillMissing, importing } = state;
  const toImport = summary.fresh + summary.contactPeople;

  const names = summary.freshNames.slice(0, 3).join(', ');
  const more = summary.freshNames.length > 3 ? ` ${t('contactsImport.review.more', { count: summary.freshNames.length - 3 })}` : '';

  const groups = [
    { key: 'new', title: t('contactsImport.review.newClients'), sub: names + more, n: summary.fresh, tone: 'accent' as const },
    {
      key: 'contacts',
      title: t('contactsImport.review.contactPeople'),
      sub: t('contactsImport.review.contactPeopleSub'),
      n: summary.contactPeople,
      tone: 'ink' as const,
    },
    {
      key: 'existing',
      title: t('contactsImport.review.existing'),
      sub: t('contactsImport.review.existingSub'),
      n: summary.existing,
      tone: 'warn' as const,
    },
  ].filter((g) => g.n > 0);

  const fieldPills: { key: keyof ImportFields | 'name'; label: string }[] = [
    { key: 'name', label: t('contactsImport.review.name') },
    { key: 'phone', label: t('contactsImport.review.phone') },
    { key: 'email', label: t('contactsImport.review.email') },
    { key: 'role', label: t('contactsImport.review.role') },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: amazen.layout.gutter,
          gap: amazen.layout.block,
          paddingBottom: amazen.space(6),
        }}>
        <GlassCard style={{ gap: amazen.space(1) }}>
          <Eyebrow>{t('contactsImport.review.eyebrow')}</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: amazen.space(2.5) }}>
            <AText variant="displaySm" tone="strong" numeric>{String(toImport)}</AText>
            <AText variant="h3" tone="onGlass">{t('contactsImport.review.of', { count: summary.total })}</AText>
          </View>
          {spaces.length ? (
            <View style={{ gap: amazen.space(1.5), paddingTop: amazen.space(2) }}>
              <AText variant="caption" tone="onGlass">{t('contactsImport.review.into')}</AText>
              <FilterRow>
                {spaces.map((s) => <FilterPill key={s.id} label={s.name} on={spaceId === s.id} onPress={() => onSpace(s.id)} />)}
              </FilterRow>
            </View>
          ) : null}
        </GlassCard>

        <Well style={{ paddingVertical: amazen.space(1) }}>
          {groups.map((g, i) => (
            <View key={g.key}>
              {i ? <WellDivider /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3) }}>
                <View style={{ flex: 1 }}>
                  <AText variant="body" tone="strong">{g.title}</AText>
                  {g.sub ? <AText variant="caption" tone="muted" numberOfLines={1}>{g.sub}</AText> : null}
                </View>
                <AText variant="body" tone={g.tone} numeric>{String(g.n)}</AText>
              </View>
              {g.key === 'existing' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingBottom: amazen.space(3) }}>
                  <AText variant="caption" tone="ink" style={{ flex: 1 }}>{t('contactsImport.review.fill')}</AText>
                  <Switch
                    value={fillMissing}
                    onValueChange={setFillMissing}
                    trackColor={{ true: c.accentSolid, false: c.tile }}
                    accessibilityLabel={t('contactsImport.review.fill')}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </Well>

        <View style={{ gap: amazen.space(2), paddingHorizontal: amazen.space(1) }}>
          <Eyebrow tone="onGradient">{t('contactsImport.review.taken')}</Eyebrow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(1.5) }}>
            {fieldPills.map((f) => (
              <FilterPill
                key={f.key}
                label={f.label}
                // The name is what a client IS — always taken, shown so the list is complete.
                on={f.key === 'name' ? true : fields[f.key]}
                disabled={f.key === 'name'}
                onPress={() => { if (f.key !== 'name') setFields({ ...fields, [f.key]: !fields[f.key] }); }}
              />
            ))}
          </View>
        </View>
        {!spaceId ? (
          <AText variant="caption" tone="warn" style={{ paddingHorizontal: amazen.space(1) }}>
            {t('contactsImport.review.noSpace')}
          </AText>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: amazen.layout.gutter, paddingBottom: amazen.space(4) }}>
        <PrimaryButton
          label={t('contactsImport.review.cta')}
          detail={toImport ? String(toImport) : undefined}
          loading={importing}
          disabled={!spaceId || (!toImport && !(fillMissing && summary.existing))}
          onPress={onImport}
        />
      </View>
    </View>
  );
}
