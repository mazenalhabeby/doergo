import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useResponsive } from '../../lib/responsive';
import { useHeldAssets } from '../../hooks/use-held-assets';
import { documentsApi, type DocumentType, type MemberDocument } from '../../lib/api';
import { useDocumentRequirements } from '../../contexts/document-requirements-context';
import { useSyncStatus } from '../../offline/offline-context';
import { STILL_MINE } from '../../offline/actions/outcome';
import { stillNeeded, type AskRequirement, type AskedRow } from '../../lib/document-asks';
import {
  AText,
  FilterPill,
  FilterRow,
  Ground,
  HeaderBack,
  PrimaryButton,
  ScreenHeader,
  SearchField,
  Well,
  Pill,
  SectionLabel,
  SheetOption,
} from '../amazen';
import { centeredContent } from '../screen-container';
import { JobSheet } from '../job/job-ui';
import { SupplyDocumentSheet } from '../supply-document-sheet';
import { DocumentRow, dayOf, useDocumentTag, usePeriod } from './document-row';
import { httpsUrl, openSafeUrl } from '../../lib/safe-links';
import { useDocumentsScreen } from './use-documents-screen';
import { Fact } from './documents-screen-helpers';

/**
 * MY DOCUMENTS — what is asked of the member, what waits on their signature,
 * and their whole file by year.
 *
 * ⚠️ No row carries a link. One is minted when "Open the file" is tapped, and
 * that mint is what records the document as opened — a list that pre-fetched
 * links would make the delivery evidence meaningless.
 *
 * The signing screen is not this file's: a document waiting on a signature
 * goes there exactly as before.
 */
export function DocumentsScreen() {
  const {
    amazen,
    c,
    t,
    wide,
    refreshRequirements,
    canPropose,
    periodOf,
    documents,
    types,
    requirements,
    state,
    setState,
    refreshing,
    typeId,
    setTypeId,
    year,
    setYear,
    picker,
    setPicker,
    opened,
    setOpened,
    opening,
    supply,
    setSupply,
    load,
    canAdd,
    onPaperOf,
    visible,
    sections,
    years,
    usedTypes,
    openFile,
    tapDocument,
    sendNew,
    back,
    filtered,
    header,
    countFor,
    tag,
  } = useDocumentsScreen();

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('profile.documents', 'Documents')}
        leading={<HeaderBack onPress={back} />}
        actions={
          canAdd
            ? [
                {
                  label: `＋ ${t('documents.add', 'Add')}`,
                  a11yLabel: t('documents.supply.action'),
                  onPress: () => setSupply({ typeId: null }),
                },
              ]
            : undefined
        }
        style={wide ?? undefined}
      />
      <SectionList
        sections={state === 'ready' ? sections : []}
        keyExtractor={(d) => d.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12) }, wide]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={c.accent}
            colors={[c.accent]}
          />
        }
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <SectionLabel
            tone={section.tone}
            style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(4), paddingBottom: amazen.space(2) }}
          >
            {section.title}
          </SectionLabel>
        )}
        renderItem={({ item, index, section }) => {
          const r0 = amazen.radius.panel;
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <View style={{
              backgroundColor: c.well, paddingHorizontal: amazen.space(3.5),
              borderTopLeftRadius: first ? r0 : 0, borderTopRightRadius: first ? r0 : 0,
              borderBottomLeftRadius: last ? r0 : 0, borderBottomRightRadius: last ? r0 : 0,
            }}>
              <DocumentRow doc={item} first={first} onPaper={onPaperOf(item)} busy={opening === item.id} onPress={tapDocument} />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: amazen.space(8), gap: amazen.space(2) }}>
            {state === 'loading' ? (
              <AText variant="caption" tone="onGlass">{t('common.loading', 'Loading…')}</AText>
            ) : state === 'failed' ? (
              <>
                <AText variant="body" tone="onGlass">{t('documents.loadFailed')}</AText>
                <PrimaryButton
                  label={t('common.retry', 'Try again')}
                  onPress={() => {
                    setState('loading');
                    void load();
                  }}
                  style={{ alignSelf: 'stretch', marginTop: amazen.space(2) }}
                />
              </>
            ) : (
              <>
                <AText variant="body" tone="strong">{filtered ? t('documents.noMatches') : t('documents.my.empty')}</AText>
                <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
                  {filtered ? t('documents.noMatchesHint') : t('documents.my.emptyHint')}
                </AText>
              </>
            )}
          </View>
        }
      />

      {/* ---------- a document, opened ---------- */}
      <JobSheet visible={!!opened} onClose={() => setOpened(null)} title={opened?.title}>
        {opened ? (
          <>
            <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingHorizontal: amazen.space(3.5) }}>
              <Fact first label={t('documents.fact.kind', 'Kind')} value={opened.typeLabel} />
              <Fact
                label={
                  opened.status === 'PENDING_VERIFICATION' || opened.status === 'REJECTED'
                    ? t('documents.fact.sentIn', 'Sent in')
                    : t('documents.fact.issued', 'Issued')
                }
                value={dayOf(opened.issuedAt)}
              />
              {opened.periodMonth || opened.periodYear ? <Fact label={t('documents.fact.period', 'For')} value={periodOf(opened)} /> : null}
              {opened.expiresOn ? <Fact label={t('documents.fact.validUntil', 'Valid until')} value={dayOf(opened.expiresOn)} /> : null}
              {tag ? <Fact label={t('documents.fact.state', 'State')} value={tag.label} tone={tag.tone} /> : null}
            </View>
            {opened.status === 'REJECTED' && opened.rejectionReason ? (
              <View style={{ backgroundColor: c.criticalTint, borderRadius: 16, padding: amazen.space(3.5) }}>
                <AText variant="body" style={{ color: c.critical, fontSize: 13.5, lineHeight: 19 }}>{`“${opened.rejectionReason}”`}</AText>
              </View>
            ) : null}
            {onPaperOf(opened) ? (
              <AText variant="caption" tone="muted">
                {t('documents.onPaperHint', 'Sign a printed copy and hand it back to the office.')}
              </AText>
            ) : null}
            <PrimaryButton
              label={t('documents.openTheFile', 'Open the file')}
              loading={opening === opened.id}
              onPress={() => void openFile(opened)}
            />
            {opened.status === 'REJECTED' || opened.standing === 'EXPIRED' || opened.standing === 'EXPIRING' ? (
              <SheetOption label={t('documents.sendNew', 'Send a new one')} tone="accent" onPress={() => sendNew(opened.typeId)} />
            ) : null}
          </>
        ) : null}
      </JobSheet>

      {/* ---------- filter pickers ---------- */}
      <JobSheet
        visible={!!picker}
        onClose={() => setPicker(null)}
        title={picker === 'year' ? t('documents.filter.year') : t('documents.filter.type')}>
        {picker === 'type' ? (
          <>
            <SheetOption
              label={`${t('documents.filter.anyType')} · ${countFor({ typeId: null })}`}
              tone={typeId ? 'strong' : 'accent'}
              onPress={() => {
                setTypeId(null);
                setPicker(null);
              }}
            />
            {usedTypes.map((ty) => (
              <SheetOption
                key={ty.id}
                label={`${ty.label} · ${countFor({ typeId: ty.id })}`}
                tone={typeId === ty.id ? 'accent' : 'strong'}
                onPress={() => {
                  setTypeId(ty.id);
                  setPicker(null);
                }}
              />
            ))}
          </>
        ) : picker === 'year' ? (
          <>
            <SheetOption
              label={`${t('documents.filter.anyYear')} · ${countFor({ year: null })}`}
              tone={year === null ? 'accent' : 'strong'}
              onPress={() => {
                setYear(null);
                setPicker(null);
              }}
            />
            {years.map((y) => (
              <SheetOption
                key={y}
                label={`${y} · ${countFor({ year: y })}`}
                tone={year === y ? 'accent' : 'strong'}
                onPress={() => {
                  setYear(y);
                  setPicker(null);
                }}
              />
            ))}
          </>
        ) : null}
      </JobSheet>

      <SupplyDocumentSheet
        types={types}
        visible={!!supply}
        initialTypeId={supply?.typeId ?? null}
        requirements={requirements}
        documents={documents}
        onClose={() => setSupply(null)}
        /* The badge and the home strip read a cached count — supplying is exactly when it stops being true. */
        onSubmitted={() => { void load(); void refreshRequirements({ force: true }); }}
        onContract={canPropose ? () => {
          setSupply(null);
          setTimeout(() => router.push('/(app)/send-document' as never), 280);
        } : undefined}
      />
    </Ground>
  );
}
