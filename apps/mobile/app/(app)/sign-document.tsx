import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { documentsApi, type DocumentChain } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import { SignatureCapture, ScreenContainer } from '../../src/components';

/*
  Signing, on a phone.

  THREE STEPS, NAMED AND COUNTED. Signing products that show "step 2 of 3"
  complete measurably more often than ones that do not, and more than half of
  business signatures now happen on a handheld — so the shape of this screen is
  the shape that matters most.

    1  Read      — the document, opened in a real viewer
    2  Agree     — consent, recorded as its own act
    3  Sign      — the drawing, then the seal

  Consent is separate from the drawing on purpose. eIDAS treats agreement to
  the electronic form as a distinct thing from the signature, and a trail that
  merged them could not show the signer was told what they were doing first.

  The idempotency key is generated ONCE, when the screen mounts, and reused on
  every retry. A van loses signal mid-request; the retry must return the seal
  that already exists rather than sign a second time.
*/

type Step = 'read' | 'agree' | 'sign' | 'done';

export default function SignDocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; title?: string; mode?: string }>();

  const [step, setStep] = useState<Step>('read');
  const [opening, setOpening] = useState(false);
  const [hasRead, setHasRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  /*
    Who has signed this already.

    A manager countersigning a time sheet is agreeing with the worker's
    signature, and being asked to do that without seeing it is being asked to
    rubber-stamp — which is the thing a chain exists to prevent.

    Silent when there is no chain: most documents have one signer, and an empty
    panel on every payslip would be noise.
  */
  const [chain, setChain] = useState<DocumentChain | null>(null);

  useEffect(() => {
    let cancelled = false;
    documentsApi
      .chain(String(params.id))
      .then((c) => { if (!cancelled && c?.steps?.length > 1) setChain(c); })
      // Best effort: the panel is context, not a precondition for signing.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [params.id]);

  /*
    Made once, deliberately, and never regenerated.

    A key that changed on retry would defeat its own purpose — the server would
    see a new attempt and sign again. `useMemo` with an empty dependency list is
    what pins it to the life of this screen.
  */
  const idempotencyKey = useMemo(
    () => `sign-${params.id}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const isAcknowledge = params.mode === 'ACKNOWLEDGE';

  const openDocument = useCallback(async () => {
    setOpening(true);
    try {
      const res = await documentsApi.downloadUrl(String(params.id));
      if (!res?.url) throw new Error(t('documents.openFailed'));
      await Linking.openURL(res.url);
      // Opening is what "read" means here. The app cannot know they read it —
      // but it can record that it was opened, which is what the trail claims.
      setHasRead(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('documents.openFailed'));
    } finally {
      setOpening(false);
    }
  }, [params.id, t, toast]);

  const agree = useCallback(async () => {
    setBusy(true);
    try {
      await documentsApi.consent(String(params.id));
      setStep(isAcknowledge ? 'done' : 'sign');
      if (isAcknowledge) {
        await documentsApi.acknowledge(String(params.id));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('documents.sign.failed'));
    } finally {
      setBusy(false);
    }
  }, [params.id, isAcknowledge, t, toast]);

  const submit = useCallback(async (signatureImage: string) => {
    setBusy(true);
    try {
      const res = await documentsApi.sign(String(params.id), { signatureImage, idempotencyKey });
      // Kept so the confirmation can show the mark they actually made.
      setSignature(signatureImage);
      setStep('done');
      if (res?.alreadySigned) {
        // Not an error. A retry found the seal that already existed, which is
        // exactly what the key is for — say so plainly rather than alarm anyone.
        toast.success(t('documents.sign.alreadySigned'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('documents.sign.failed'));
    } finally {
      setBusy(false);
    }
  }, [params.id, idempotencyKey, t, toast]);

  const stepNumber = step === 'read' ? 1 : step === 'agree' ? 2 : 3;
  const totalSteps = isAcknowledge ? 2 : 3;

  return (
    <View style={[s.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {params.title || t('documents.sign.title')}
        </Text>
        <View style={s.headerSpacer} />
      </View>

      <ScreenContainer>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xxl }}>
          {/* Who else is on this document, and where it has got to. */}
          {chain && (
            <View style={[s.chainCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.chainTitle, { color: colors.textMuted }]}>
                {t('documents.sign.chainTitle', 'Signatures on this document')}
              </Text>
              {chain.steps.map((cs) => {
                const done = cs.status === 'SIGNED';
                const skipped = cs.status === 'SKIPPED';
                return (
                  <View key={cs.order} style={s.chainRow}>
                    <Ionicons
                      name={done ? 'checkmark-circle' : skipped ? 'remove-circle-outline' : 'ellipse-outline'}
                      size={16}
                      color={done ? COLORS.success : skipped ? colors.textMuted : colors.textSecondary}
                    />
                    <Text
                      style={[
                        s.chainName,
                        { color: skipped ? colors.textMuted : colors.textPrimary },
                      ]}
                      numberOfLines={1}
                    >
                      {cs.name ?? t('documents.sign.chainNobody', 'Not required')}
                      {cs.isYou && ` (${t('documents.sign.chainYou', 'you')})`}
                    </Text>
                    <Text style={[s.chainRole, { color: colors.textMuted }]} numberOfLines={1}>
                      {t(`documents.sign.roles.${cs.role}`, cs.role)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Progress. Counted, because knowing how much is left is what stops
              people abandoning halfway. */}
          {step !== 'done' && (
            <View style={s.progress}>
              <Text style={[s.progressText, { color: colors.textMuted }]}>
                {t('documents.sign.stepOf', { step: stepNumber, total: totalSteps })}
              </Text>
              <View style={[s.track, { backgroundColor: colors.surfaceRaised }]}>
                <View
                  style={[
                    s.fill,
                    { backgroundColor: COLORS.primary, width: `${(stepNumber / totalSteps) * 100}%` },
                  ]}
                />
              </View>
            </View>
          )}

          {/* ── 1 · Read ─────────────────────────────────────────────────── */}
          {step === 'read' && (
            <View style={s.pane}>
              <Text style={[s.h1, { color: colors.textPrimary }]}>
                {t('documents.sign.readTitle')}
              </Text>
              <Text style={[s.body, { color: colors.textSecondary }]}>
                {t('documents.sign.readBody')}
              </Text>

              <TouchableOpacity
                style={[s.primary, { backgroundColor: COLORS.primary }]}
                onPress={openDocument}
                disabled={opening}
                accessibilityRole="button"
              >
                {opening ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
                    <Text style={s.primaryText}>{t('documents.sign.openDocument')}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.secondary,
                  { borderColor: colors.border },
                  !hasRead && s.disabled,
                ]}
                onPress={() => setStep('agree')}
                disabled={!hasRead}
                accessibilityRole="button"
                accessibilityState={{ disabled: !hasRead }}
              >
                <Text style={[s.secondaryText, { color: hasRead ? colors.textPrimary : colors.textMuted }]}>
                  {t('documents.sign.readIt')}
                </Text>
              </TouchableOpacity>

              {!hasRead && (
                <Text style={[s.hint, { color: colors.textMuted }]}>
                  {t('documents.sign.mustOpen')}
                </Text>
              )}
            </View>
          )}

          {/* ── 2 · Agree ────────────────────────────────────────────────── */}
          {step === 'agree' && (
            <View style={s.pane}>
              <Text style={[s.h1, { color: colors.textPrimary }]}>
                {t('documents.sign.agreeTitle')}
              </Text>

              <View style={[s.consentBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.consentText, { color: colors.textPrimary }]}>
                  {t('documents.sign.consentText')}
                </Text>
              </View>

              <Text style={[s.body, { color: colors.textSecondary }]}>
                {t('documents.sign.recordedNotice')}
              </Text>

              <View style={[s.recordList, { borderColor: colors.border }]}>
                {['account', 'device', 'time', 'hash'].map((k) => (
                  <View key={k} style={s.recordRow}>
                    <Ionicons name="ellipse" size={5} color={colors.textMuted} />
                    <Text style={[s.recordText, { color: colors.textSecondary }]}>
                      {t(`documents.sign.records.${k}`)}
                    </Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[s.primary, { backgroundColor: COLORS.primary }]}
                onPress={agree}
                disabled={busy}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.primaryText}>
                    {isAcknowledge ? t('documents.sign.confirmRead') : t('documents.sign.agreeAndSign')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── 3 · Sign ─────────────────────────────────────────────────── */}
          {step === 'sign' && (
            <View style={s.pane}>
              <Text style={[s.h1, { color: colors.textPrimary }]}>
                {t('documents.sign.signTitle')}
              </Text>
              <Text style={[s.body, { color: colors.textSecondary }]}>
                {t('documents.sign.signBody')}
              </Text>

              {/* The same pad members already use on service reports — the
                  gesture is familiar, which is most of what matters here. */}
              <SignatureCapture
                title={t('documents.sign.padTitle')}
                onSave={submit}
                onClear={() => {}}
              />

              {busy && (
                <View style={s.busyRow}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={[s.hint, { color: colors.textMuted }]}>
                    {t('documents.sign.sealing')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Done ─────────────────────────────────────────────────────── */}
          {step === 'done' && (
            <View style={[s.pane, s.done]}>
              <View style={[s.ring, { backgroundColor: colors.successLight }]}>
                <Ionicons name="checkmark" size={30} color={COLORS.success} />
              </View>
              <Text style={[s.h1, { color: colors.textPrimary, textAlign: 'center' }]}>
                {isAcknowledge ? t('documents.sign.acknowledged') : t('documents.sign.sealed')}
              </Text>
              <Text style={[s.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                {isAcknowledge ? t('documents.sign.acknowledgedBody') : t('documents.sign.sealedBody')}
              </Text>

              {/*
                The mark they just made, shown back to them.

                Signing something and being handed only a green tick leaves the
                obvious question unanswered — what did it actually record? This
                is the same image that is now on the document.
              */}
              {signature && (
                <View style={[s.sigCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.sigLabel, { color: colors.textMuted }]}>
                    {t('documents.sign.yourSignature')}
                  </Text>
                  <Image source={{ uri: signature }} style={s.sigImage} resizeMode="contain" />
                  <View style={[s.sigRule, { backgroundColor: colors.border }]} />
                  <Text style={[s.sigHint, { color: colors.textMuted }]}>
                    {t('documents.sign.onDocument')}
                  </Text>
                </View>
              )}

              {/* Opening the SEALED document is the proof. Offered first,
                  because "let me see it" is the next thing anybody thinks. */}
              {!isAcknowledge && (
                <TouchableOpacity
                  style={[s.primary, { backgroundColor: COLORS.primary }]}
                  onPress={openDocument}
                  disabled={opening}
                  accessibilityRole="button"
                >
                  {opening ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
                      <Text style={s.primaryText}>{t('documents.sign.openSigned')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[s.secondary, { borderColor: colors.border }]}
                onPress={() => router.replace('/documents' as never)}
                accessibilityRole="button"
              >
                <Text style={[s.secondaryText, { color: colors.textPrimary }]}>
                  {t('documents.sign.viewDocuments')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  headerSpacer: { width: 26 },

  progress: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, gap: SPACING.xs },
  progressText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },

  pane: { padding: SPACING.lg, gap: SPACING.md },
  h1: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  body: { fontSize: FONT_SIZE.base, lineHeight: 21 },
  hint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },

  /*
    alignSelf: 'stretch' on BOTH.

    The confirmation pane centres its children so the tick and the headline sit
    on the middle line — and that made every button shrink to the width of its
    own label. "Open the signed document" came out wide, "View my documents"
    narrow, neither aligned with the card above them, and the pair read as two
    unrelated controls rather than a primary and its alternative.

    Setting it on the button rather than fixing the parent means the same button
    keeps its full width in any pane, however that pane chooses to align things.
  */
  primary: {
    alignSelf: 'stretch',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    minHeight: 52,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md, marginTop: SPACING.xs,
  },
  primaryText: { color: '#FFFFFF', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  secondary: {
    alignSelf: 'stretch',
    // Same height as the primary, so the pair reads as one stack rather than
    // two controls that happen to be near each other.
    minHeight: 52,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md, borderWidth: 1,
  },
  secondaryText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.medium },
  disabled: { opacity: 0.45 },

  consentBox: {
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
  },
  consentText: { fontSize: FONT_SIZE.base, lineHeight: 21, fontWeight: FONT_WEIGHT.medium },

  recordList: {
    borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md, gap: SPACING.xs,
  },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  recordText: { fontSize: FONT_SIZE.sm, flex: 1 },

  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },

  done: { alignItems: 'center', paddingTop: SPACING.xxl, gap: SPACING.md },
  sigCard: {
    width: '100%', padding: SPACING.md, borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: SPACING.xs,
  },
  sigLabel: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  // On white, because that is how it was captured and how it sits on the page.
  sigImage: { width: '80%', height: 90, backgroundColor: '#FFFFFF', borderRadius: RADIUS.sm },
  sigRule: { width: '80%', height: StyleSheet.hairlineWidth },
  sigHint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },
  ring: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },

  chainCard: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  chainTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 5,
  },
  chainName: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  chainRole: { fontSize: FONT_SIZE.xs },
});