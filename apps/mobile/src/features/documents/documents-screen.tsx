import React from 'react';
import { SectionList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { useResponsive } from '@/lib/responsive';
import { useHeldAssets } from '@/hooks/use-held-assets';
import { useDocumentRequirements } from '@/contexts/document-requirements-context';
import { useSyncStatus } from '@/offline/offline-context';
import { STILL_MINE } from '@/offline/actions/outcome';
import { AText, Ground, HeaderBack, PrimaryButton, ScreenHeader, SectionLabel, SheetOption } from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { JobSheet } from '../job/job-ui';
import { SupplyDocumentSheet } from '../supply-document/supply-document-sheet';
import { DocumentRow, dayOf } from './document-row';
import { useDocumentsScreen } from './use-documents-screen';
import { FactRow } from '@/components/amazen/fact-row';
import { refreshControl } from '@/components/pull-refresh';

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
  const vm = useDocumentsScreen();
  const { opened } = vm;

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={vm.t('profile.documents', 'Documents')}
        leading={<HeaderBack onPress={vm.back} />}
        actions={
          vm.canAdd
            ? [
                {
                  label: `＋ ${vm.t('documents.add', 'Add')}`,
                  a11yLabel: vm.t('documents.supply.action'),
                  onPress: () => vm.setSupply({ typeId: null }),
                },
              ]
            : undefined
        }
        style={vm.wide ?? undefined}
      />
      <SectionList
        sections={vm.state === 'ready' ? vm.sections : []}
        keyExtractor={(d) => d.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[{ paddingHorizontal: vm.amazen.space(4), paddingBottom: vm.amazen.space(12) }, vm.wide]}
        refreshControl={
          refreshControl({ refreshing: vm.refreshing, onRefresh: () => void vm.load('refresh'), color: vm.c.accent })
        }
        ListHeaderComponent={vm.header}
        renderSectionHeader={({ section }) => (
          <SectionLabel
            tone={section.tone}
            style={{ paddingHorizontal: vm.amazen.space(1), paddingTop: vm.amazen.space(4), paddingBottom: vm.amazen.space(2) }}
          >
            {section.title}
          </SectionLabel>
        )}
        renderItem={({ item, index, section }) => {
          const r0 = vm.amazen.radius.panel;
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <View style={{
              backgroundColor: vm.c.well, paddingHorizontal: vm.amazen.space(3.5),
              borderTopLeftRadius: first ? r0 : 0, borderTopRightRadius: first ? r0 : 0,
              borderBottomLeftRadius: last ? r0 : 0, borderBottomRightRadius: last ? r0 : 0,
            }}>
              <DocumentRow doc={item} first={first} onPaper={vm.onPaperOf(item)} busy={vm.opening === item.id} onPress={vm.tapDocument} />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: vm.amazen.space(8), gap: vm.amazen.space(2) }}>
            {vm.state === 'loading' ? (
              <AText variant="caption" tone="onGlass">{vm.t('common.loading', 'Loading…')}</AText>
            ) : vm.state === 'failed' ? (
              <>
                <AText variant="body" tone="onGlass">{vm.t('documents.loadFailed')}</AText>
                <PrimaryButton
                  label={vm.t('common.retry', 'Try again')}
                  onPress={() => {
                    vm.setState('loading');
                    void vm.load();
                  }}
                  style={{ alignSelf: 'stretch', marginTop: vm.amazen.space(2) }}
                />
              </>
            ) : (
              <>
                <AText variant="body" tone="strong">{vm.filtered ? vm.t('documents.noMatches') : vm.t('documents.my.empty')}</AText>
                <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
                  {vm.filtered ? vm.t('documents.noMatchesHint') : vm.t('documents.my.emptyHint')}
                </AText>
              </>
            )}
          </View>
        }
      />

      {/* ---------- a document, opened ---------- */}
      <JobSheet visible={!!opened} onClose={() => vm.setOpened(null)} title={opened?.title}>
        {opened ? (
          <>
            <View style={{ backgroundColor: vm.c.sunken, borderRadius: 18, paddingHorizontal: vm.amazen.space(3.5) }}>
              <FactRow first label={vm.t('documents.fact.kind', 'Kind')} value={opened.typeLabel} />
              <FactRow
                label={
                  opened.status === 'PENDING_VERIFICATION' || opened.status === 'REJECTED'
                    ? vm.t('documents.fact.sentIn', 'Sent in')
                    : vm.t('documents.fact.issued', 'Issued')
                }
                value={dayOf(opened.issuedAt)}
              />
              {opened.periodMonth || opened.periodYear ? (
                <FactRow label={vm.t('documents.fact.period', 'For')} value={vm.periodOf(opened)} />
              ) : null}
              {opened.expiresOn ? (
                <FactRow label={vm.t('documents.fact.validUntil', 'Valid until')} value={dayOf(opened.expiresOn)} />
              ) : null}
              {vm.tag ? <FactRow label={vm.t('documents.fact.state', 'State')} value={vm.tag.label} tone={vm.tag.tone} /> : null}
            </View>
            {opened.status === 'REJECTED' && opened.rejectionReason ? (
              <View style={{ backgroundColor: vm.c.criticalTint, borderRadius: 16, padding: vm.amazen.space(3.5) }}>
                <AText
                  variant="body"
                  style={{ color: vm.c.critical, fontSize: 13.5, lineHeight: 19 }}
                >{`“${opened.rejectionReason}”`}</AText>
              </View>
            ) : null}
            {vm.onPaperOf(opened) ? (
              <AText variant="caption" tone="muted">
                {vm.t('documents.onPaperHint', 'Sign a printed copy and hand it back to the office.')}
              </AText>
            ) : null}
            <PrimaryButton
              label={vm.t('documents.openTheFile', 'Open the file')}
              loading={vm.opening === opened.id}
              onPress={() => void vm.openFile(opened)}
            />
            {opened.status === 'REJECTED' || opened.standing === 'EXPIRED' || opened.standing === 'EXPIRING' ? (
              <SheetOption label={vm.t('documents.sendNew', 'Send a new one')} tone="accent" onPress={() => vm.sendNew(opened.typeId)} />
            ) : null}
          </>
        ) : null}
      </JobSheet>

      {/* ---------- filter pickers ---------- */}
      <JobSheet
        visible={!!vm.picker}
        onClose={() => vm.setPicker(null)}
        title={vm.picker === 'year' ? vm.t('documents.filter.year') : vm.t('documents.filter.type')}>
        {vm.picker === 'type' ? (
          <>
            <SheetOption
              label={`${vm.t('documents.filter.anyType')} · ${vm.countFor({ typeId: null })}`}
              tone={vm.typeId ? 'strong' : 'accent'}
              onPress={() => {
                vm.setTypeId(null);
                vm.setPicker(null);
              }}
            />
            {vm.usedTypes.map((ty) => (
              <SheetOption
                key={ty.id}
                label={`${ty.label} · ${vm.countFor({ typeId: ty.id })}`}
                tone={vm.typeId === ty.id ? 'accent' : 'strong'}
                onPress={() => {
                  vm.setTypeId(ty.id);
                  vm.setPicker(null);
                }}
              />
            ))}
          </>
        ) : vm.picker === 'year' ? (
          <>
            <SheetOption
              label={`${vm.t('documents.filter.anyYear')} · ${vm.countFor({ year: null })}`}
              tone={vm.year === null ? 'accent' : 'strong'}
              onPress={() => {
                vm.setYear(null);
                vm.setPicker(null);
              }}
            />
            {vm.years.map((y) => (
              <SheetOption
                key={y}
                label={`${y} · ${vm.countFor({ year: y })}`}
                tone={vm.year === y ? 'accent' : 'strong'}
                onPress={() => {
                  vm.setYear(y);
                  vm.setPicker(null);
                }}
              />
            ))}
          </>
        ) : null}
      </JobSheet>

      <SupplyDocumentSheet
        types={vm.types}
        visible={!!vm.supply}
        initialTypeId={vm.supply?.typeId ?? null}
        requirements={vm.requirements}
        documents={vm.documents}
        onClose={() => vm.setSupply(null)}
        /* The badge and the home strip read a cached count — supplying is exactly when it stops being true. */
        onSubmitted={() => { void vm.load(); void vm.refreshRequirements({ force: true }); }}
        onContract={vm.canPropose ? () => {
          vm.setSupply(null);
          setTimeout(() => router.push('/(app)/send-document' as never), 280);
        } : undefined}
      />
    </Ground>
  );
}
