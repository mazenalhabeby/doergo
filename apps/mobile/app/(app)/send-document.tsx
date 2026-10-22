import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { CameraView } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File as FsFile } from 'expo-file-system';

import { DateField } from '../../src/components';
import { Ground, HeaderBack, ScreenHeader } from '../../src/components/amazen';
import { goBack } from '../../src/lib/go-back';
import { useTheme } from '../../src/contexts/theme-context';
import { CaptureReviewFoot } from '../../src/features/equipment/capture-review';
import { CaptureCamera, CaptureSkip } from '../../src/features/equipment/capture-camera';
import { useToast } from '../../src/island/island-context';
import { MediaAccessScreen } from '../../src/permissions/media-access-screen';
import { useCameraAccess } from '../../src/permissions/use-media-access';
import { canScanContracts, scanContract } from '../../src/lib/receipt-scan';
import { assetProposalsApi, uploadToPresignedUrl, type ContractFields } from '../../src/lib/api';
import { classifyDocument, type DocumentClassification } from '@hbcfield/shared/client';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import { useOffline } from '../../src/offline/offline-context';
import { createFromPhone } from '../../src/offline/actions/queued-create';
import { uuidv7 } from '../../src/offline/ids';
import { useSendDocumentScreen } from '../../src/features/documents/use-send-document-screen';
import { Field, s } from '../../src/features/documents/send-document-screen-helpers';

export default function SendDocumentScreen() {
  const {
    colors,
    t,
    insets,
    cam,
    camera,
    stage,
    setStage,
    busy,
    sending,
    shot,
    verdict,
    fields,
    setFields,
    capture,
    discardShot,
    named,
    send,
  } = useSendDocumentScreen();

  // ── Camera permission ─────────────────────────────────────────────────────
  if (stage === 'camera' && !cam.granted) {
    return (
      <Ground style={s.safe}>
        <ScreenHeader title={t('sendDoc.title', 'Send a document')} leading={<HeaderBack onPress={() => goBack()} />} />
        <MediaAccessScreen purpose="document" access={cam} onCancel={() => setStage('review')} />
      </Ground>
    );
  }

  // ── What it made of it ────────────────────────────────────────────────────
  if (stage === 'review') {
    const recognised = verdict?.kind === 'asset-contract';
    return (
      <Ground style={s.safe}>
        <ScreenHeader
          title={t('sendDoc.check', 'Check before sending')}
          leading={
            <HeaderBack
              onPress={() => {
                discardShot();
                setStage('camera');
              }}
            />
          }
        />
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl + insets.bottom }}>
          {/*
            What the reader thought, and WHY — in words the member can check
            against the paper in their hand. A verdict nobody can argue with is
            one people either trust blindly or ignore entirely.
          */}
          <View style={[s.verdict, { borderColor: recognised ? 'rgba(22,163,74,.45)' : colors.border }]}>
            <Ionicons
              name={recognised ? 'sparkles' : 'help-circle-outline'}
              size={18}
              color={recognised ? '#22c55e' : colors.textMuted}
            />
            <View style={s.grow}>
              <Text style={[s.verdictTitle, { color: colors.textPrimary }]}>
                {recognised
                  ? t('sendDoc.looksLike', 'This looks like a contract for a new asset')
                  : t('sendDoc.notSure', 'Not sure what this is')}
              </Text>
              <Text style={[s.verdictSub, { color: colors.textMuted }]}>
                {verdict?.signals?.length
                  ? verdict.signals.join(' · ')
                  : t('sendDoc.notSureSub', 'You can still send it — somebody will look.')}
              </Text>
            </View>
          </View>

          <Text style={[s.label, { color: colors.textMuted, marginTop: SPACING.lg }]}>
            {t('sendDoc.what', 'What it is')}
          </Text>
          <Field
            colors={colors}
            label={t('contract.fRegistration', 'Registration')}
            value={fields.registration ?? ''}
            onChange={(v) => setFields((f) => ({ ...f, registration: v }))}
          />
          <Field
            colors={colors}
            label={t('contract.fVin', 'VIN / serial')}
            value={fields.vin ?? ''}
            onChange={(v) => setFields((f) => ({ ...f, vin: v }))}
          />
          <Field
            colors={colors}
            label={t('contract.fManufacturer', 'Make')}
            value={fields.manufacturer ?? ''}
            onChange={(v) => setFields((f) => ({ ...f, manufacturer: v }))}
          />
          <Field
            colors={colors}
            label={t('contract.fModel', 'Model')}
            value={fields.model ?? ''}
            onChange={(v) => setFields((f) => ({ ...f, model: v }))}
          />
          {/* The term, as read — it was sent unseen, so a misread date reached the office unchecked. */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
            <View style={{ flex: 1 }}>
              <DateField
                value={(fields.startsOn ?? '').slice(0, 10)}
                onChange={(v) => setFields((f) => ({ ...f, startsOn: v }))}
                clearable
                placeholder={t('contract.fStartsOn', 'Starts on')}
                title={t('contract.fStartsOn', 'Starts on')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <DateField
                value={(fields.endsOn ?? '').slice(0, 10)}
                onChange={(v) => setFields((f) => ({ ...f, endsOn: v }))}
                clearable
                placeholder={t('contract.fEndsOn', 'Ends on')}
                title={t('contract.fEndsOn', 'Ends on')}
              />
            </View>
          </View>

          {!named && (
            <Text style={s.warn}>
              {t('contract.needName', 'Nothing here identifies it yet — a registration, a VIN, or a make and model.')}
            </Text>
          )}

          <CaptureReviewFoot
            shot={!!shot}
            icon="document"
            attachedLabel={t('sendDoc.pageAttached', 'The page will be sent too')}
            missingLabel={t('sendDoc.noPage', 'No page')}
            onRetake={() => {
              discardShot();
              setStage('camera');
            }}
            onSend={send}
            sendDisabled={!named || sending}
            ready={!!named}
            sending={sending}
            sendLabel={recognised ? t('sendDoc.send', 'Send it in') : t('sendDoc.sendAnyway', 'Send it anyway')}
            footnote={t('sendDoc.hint', 'Nothing is created. Somebody responsible for you decides.')}
            primary={COLORS.primary}
            border={colors.border}
            muted={colors.textMuted}
          />
        </ScrollView>
      </Ground>
    );
  }

  // ── The page ──────────────────────────────────────────────────────────────
  return (
    <CaptureCamera
      cameraRef={camera}
      hint={t('sendDoc.aim', 'Get the page in shot — it is read on this phone')}
      wideHint
      onCapture={capture}
      busy={busy}
    >
      <CaptureSkip label={t('contract.typeInstead', 'Type it instead')} onPress={() => setStage('review')} />
    </CaptureCamera>
  );
}
