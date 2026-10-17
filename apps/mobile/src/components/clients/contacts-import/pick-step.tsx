import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { CONTACT_IMPORT_MAX, type PickRow, type PickSection } from '@hbcfield/shared/client';
import { useTheme } from '../../../contexts/theme-context';
import { AText, Chip, Eyebrow, FilterPill, FilterRow, PrimaryButton, SearchField } from '../../amazen';
import { ImportRow, ROW_HEIGHT } from './import-row';
import type { useContactsImport } from './use-contacts-import';

const HEADER_HEIGHT = 44;
const HIDDEN_HEIGHT = 56;
const heightOf = (r: PickRow) => (r.type === 'contact' ? ROW_HEIGHT : r.type === 'header' ? HEADER_HEIGHT : HIDDEN_HEIGHT);

const SECTION_KEY: Record<PickSection, string> = {
  suggested: 'secSuggested', clients: 'secClients', other: 'secOther', private: 'secPrivate',
};

/**
 * Who do you work with? — the address book, sorted, ticked.
 *
 * ⚠️ PERFORMANCE IS STRUCTURAL HERE. A real book is thousands of rows, so:
 *   · every row has a KNOWN height and `getItemLayout` is exact — no row is
 *     rendered to be measured, and jumping deep into the list is free;
 *   · rows are memoised on what they show; ticking re-renders the one row;
 *   · the window is small — about two screens of rows exist at any time.
 */
export function PickStep({
  state, limited, onShareMore, onNext,
}: {
  state: ReturnType<typeof useContactsImport>;
  /** iOS 18: only some contacts were shared. */
  limited: boolean;
  onShareMore: () => void;
  onNext: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { model, picked, toggle, setMany, filter, setFilter, query, setQuery, summary, tooMany } = state;

  const layout = useMemo(() => {
    const offsets: number[] = [];
    let y = 0;
    for (const r of model.rows) { offsets.push(y); y += heightOf(r); }
    return offsets;
  }, [model.rows]);
  const getItemLayout = useCallback(
    (_: ArrayLike<PickRow> | null | undefined, i: number) => ({ length: heightOf(model.rows[i]!), offset: layout[i]!, index: i }),
    [layout, model.rows],
  );

  const sectionIds = useMemo(() => {
    const m = new Map<PickSection, string[]>();
    for (const r of model.rows) if (r.type === 'contact') m.set(r.section, [...(m.get(r.section) ?? []), r.contact.id]);
    return m;
  }, [model.rows]);

  const renderItem = useCallback(({ item }: { item: PickRow }) => {
    if (item.type === 'contact') {
      return (
        <ImportRow
          contact={item.contact}
          section={item.section}
          nested={item.nested}
          members={item.members}
          on={picked.has(item.contact.id)}
          onToggle={toggle}
        />
      );
    }
    if (item.type === 'header') {
      const ids = sectionIds.get(item.section) ?? [];
      const allOn = ids.length > 0 && ids.every((id) => picked.has(id));
      return (
        <View
          style={{
            height: HEADER_HEIGHT,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            paddingBottom: amazen.space(1.5),
          }}>
          <Eyebrow tone="muted">{`${t(`contactsImport.pick.${SECTION_KEY[item.section]}`)} · ${item.count}`}</Eyebrow>
          {item.section === 'suggested' ? (
            <Pressable onPress={() => setMany(ids, !allOn)} accessibilityRole="button" hitSlop={8}
              style={{
                borderRadius: amazen.radius.full,
                backgroundColor: c.tile,
                paddingHorizontal: amazen.space(3),
                paddingVertical: amazen.space(1),
              }}>
              <AText variant="caption" tone="ink">{allOn ? t('contactsImport.pick.clear') : t('contactsImport.pick.pickAll')}</AText>
            </Pressable>
          ) : null}
        </View>
      );
    }
    return (
      <Pressable
        onPress={() => setFilter('all')}
        accessibilityRole="button"
        style={{ height: HIDDEN_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
        <AText variant="caption" tone="accent" style={{ textAlign: 'center' }}>
          {t('contactsImport.pick.hidden', { private: item.privateCount, clients: item.clientCount, other: item.otherCount })}
        </AText>
      </Pressable>
    );
  }, [picked, toggle, setMany, setFilter, sectionIds, amazen, c, t]);

  const parts = [
    summary.companies ? t('contactsImport.pick.companies', { count: summary.companies }) : null,
    summary.people ? t('contactsImport.pick.people', { count: summary.people }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: amazen.layout.gutter, gap: amazen.space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: amazen.space(2) }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Eyebrow tone="onGradient" numberOfLines={1}>
              {query.trim()
                ? t('contactsImport.pick.eyebrowSearch', { count: model.rows.filter((r) => r.type === 'contact').length })
                : t('contactsImport.pick.eyebrow', { total: model.counts.all, work: model.counts.suggested })}
            </Eyebrow>
            <AText variant="h2" tone="strong">{t('contactsImport.pick.heading')}</AText>
          </View>
          <Chip label={t('contactsImport.pick.checked')} tone="accent" />
        </View>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t('contactsImport.pick.search')}
          accessibilityLabel={t('contactsImport.pick.search')}
        />
        <FilterRow>
          <FilterPill
            label={`${t('contactsImport.pick.fSuggested')} ${model.counts.suggested}`}
            on={filter === 'suggested'}
            onPress={() => setFilter('suggested')}
          />
          <FilterPill
            label={`${t('contactsImport.pick.fAll')} ${model.counts.all}`}
            on={filter === 'all'}
            onPress={() => setFilter('all')}
          />
          <FilterPill
            label={`${t('contactsImport.pick.fClients')} ${model.counts.clients}`}
            on={filter === 'clients'}
            onPress={() => setFilter('clients')}
          />
        </FilterRow>
        {limited ? (
          <Pressable
            onPress={onShareMore}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: amazen.space(2),
            }}>
            <AText variant="caption" tone="onGradient" style={{ flex: 1 }}>{t('contactsImport.pick.limited')}</AText>
            <AText variant="caption" tone="accent">{t('contactsImport.pick.shareMore')}</AText>
          </Pressable>
        ) : null}
      </View>

      <View style={{
        flex: 1, marginTop: amazen.space(3), marginHorizontal: amazen.layout.gutter,
        backgroundColor: c.well, borderTopLeftRadius: amazen.radius.panel, borderTopRightRadius: amazen.radius.panel, overflow: 'hidden',
      }}>
        {state.loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: amazen.space(2) }}>
            <ActivityIndicator color={c.accent} />
            <AText variant="caption" tone="muted">{t('contactsImport.pick.loading')}</AText>
          </View>
        ) : (
          <FlatList
            data={model.rows}
            keyExtractor={(r) => r.key}
            renderItem={renderItem}
            extraData={picked}
            getItemLayout={getItemLayout}
            initialNumToRender={14}
            maxToRenderPerBatch={20}
            windowSize={7}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingBottom: 160 }}
            ListEmptyComponent={
              <AText variant="caption" tone="muted" style={{ textAlign: 'center', paddingTop: amazen.space(8) }}>
                {query.trim() ? t('contactsImport.pick.noMatch', { q: query.trim() }) : t('contactsImport.pick.empty')}
              </AText>
            }
          />
        )}
      </View>

      <LinearGradient
        colors={[`${c.canvas}00`, c.canvas]}
        locations={[0, 0.35]}
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: amazen.space(9),
          paddingHorizontal: amazen.layout.gutter,
          paddingBottom: amazen.space(4),
          gap: amazen.space(2.5),
        }}
      >
        {summary.privateCount ? (
          <View
            style={{
              borderRadius: amazen.radius.field,
              backgroundColor: c.warnTint,
              paddingHorizontal: amazen.space(3.5),
              paddingVertical: amazen.space(2.5),
            }}>
            <AText variant="caption" tone="warn">{t('contactsImport.pick.privateWarn', { count: summary.privateCount })}</AText>
          </View>
        ) : null}
        {tooMany ? (
          <AText variant="caption" tone="warn" style={{ textAlign: 'center' }}>
            {t('contactsImport.pick.tooMany', { max: CONTACT_IMPORT_MAX })}
          </AText>
        ) : null}
        <PrimaryButton
          label={summary.total ? t('contactsImport.pick.cta') : t('contactsImport.pick.ctaNone')}
          detail={summary.total ? parts : undefined}
          disabled={!summary.total || tooMany}
          onPress={onNext}
        />
      </LinearGradient>
    </View>
  );
}
