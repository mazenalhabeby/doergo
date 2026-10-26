import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Icon } from '@/components/amazen/ink-icon';
import { COLORS, SPACING } from '@/lib/constants';
import { SignatureCapture } from '@/components';
import { useScreenWidth } from '@/components/screen-container';
import { s } from './sign-document-screen-helpers';
import type { SignDocumentScreenState } from './use-sign-document-screen';

/** Part of SignDocumentScreen's markup, moved here unchanged; it reads the page's state from `vm`. */
export function SignDocumentScreenSign({ vm }: { vm: SignDocumentScreenState }) {
  const {
    insets,
    chain,
    colors,
    t,
    step,
    stepNumber,
    totalSteps,
    openDocument,
    opening,
    hasRead,
    setStep,
    agree,
    busy,
    isAcknowledge,
    submit,
    signature,
    router,
  } = vm;
  const wide = useScreenWidth();
  return (
    <View style={[{ flex: 1 }, wide]}>
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
                  <Icon
                    name={done ? 'selected' : skipped ? 'removeLine' : 'radioOff'}
                    size={16}
                    color={done ? COLORS.success : skipped ? colors.textMuted : colors.textSecondary}
                  />
                  <Text
                    style={[s.chainName, { color: skipped ? colors.textMuted : colors.textPrimary }]}
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
                style={[s.fill, { backgroundColor: COLORS.primary, width: `${(stepNumber / totalSteps) * 100}%` }]}
              />
            </View>
          </View>
        )}

        {/* ── 1 · Read ─────────────────────────────────────────────────── */}
        {step === 'read' && (
          <View style={s.pane}>
            <Text style={[s.h1, { color: colors.textPrimary }]}>{t('documents.sign.readTitle')}</Text>
            <Text style={[s.body, { color: colors.textSecondary }]}>{t('documents.sign.readBody')}</Text>

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
                  <Icon name="file" size={18} color="#FFFFFF" />
                  <Text style={s.primaryText}>{t('documents.sign.openDocument')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.secondary, { borderColor: colors.border }, !hasRead && s.disabled]}
              onPress={() => setStep('agree')}
              disabled={!hasRead}
              accessibilityRole="button"
              accessibilityState={{ disabled: !hasRead }}
            >
              <Text style={[s.secondaryText, { color: hasRead ? colors.textPrimary : colors.textMuted }]}>
                {t('documents.sign.readIt')}
              </Text>
            </TouchableOpacity>

            {!hasRead && <Text style={[s.hint, { color: colors.textMuted }]}>{t('documents.sign.mustOpen')}</Text>}
          </View>
        )}

        {/* ── 2 · Agree ────────────────────────────────────────────────── */}
        {step === 'agree' && (
          <View style={s.pane}>
            <Text style={[s.h1, { color: colors.textPrimary }]}>{t('documents.sign.agreeTitle')}</Text>

            <View style={[s.consentBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.consentText, { color: colors.textPrimary }]}>{t('documents.sign.consentText')}</Text>
            </View>

            <Text style={[s.body, { color: colors.textSecondary }]}>{t('documents.sign.recordedNotice')}</Text>

            <View style={[s.recordList, { borderColor: colors.border }]}>
              {['account', 'device', 'time', 'hash'].map((k) => (
                <View key={k} style={s.recordRow}>
                  <Icon name="dot" size={5} color={colors.textMuted} />
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
            <Text style={[s.h1, { color: colors.textPrimary }]}>{t('documents.sign.signTitle')}</Text>
            <Text style={[s.body, { color: colors.textSecondary }]}>{t('documents.sign.signBody')}</Text>

            {/* The same pad members already use on service reports — the
                gesture is familiar, which is most of what matters here. */}
            <SignatureCapture title={t('documents.sign.padTitle')} onSave={submit} onClear={() => {}} />

            {busy && (
              <View style={s.busyRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={[s.hint, { color: colors.textMuted }]}>{t('documents.sign.sealing')}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Done ─────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <View style={[s.pane, s.done]}>
            <View style={[s.ring, { backgroundColor: colors.successLight }]}>
              <Icon name="checkLine" size={30} color={COLORS.success} />
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
                <Text style={[s.sigLabel, { color: colors.textMuted }]}>{t('documents.sign.yourSignature')}</Text>
                <Image source={{ uri: signature }} style={s.sigImage} resizeMode="contain" />
                <View style={[s.sigRule, { backgroundColor: colors.border }]} />
                <Text style={[s.sigHint, { color: colors.textMuted }]}>{t('documents.sign.onDocument')}</Text>
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
                    <Icon name="file" size={18} color="#FFFFFF" />
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
              <Text style={[s.secondaryText, { color: colors.textPrimary }]}>{t('documents.sign.viewDocuments')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
