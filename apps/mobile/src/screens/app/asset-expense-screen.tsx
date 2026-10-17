import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DateField } from '../../components';
import { EquipmentFrame } from '../../components/equipment/equipment-frame';
import { CaptureReviewFoot } from '../../components/equipment/capture-review';
import { CaptureCamera, CaptureSkip } from '../../components/equipment/capture-camera';
import { MediaAccessScreen } from '../../permissions/media-access-screen';
import { COLORS, SPACING, RADIUS, FONT_SIZE, type FieldColors } from '../../lib/constants';
import { useAssetExpenseScreen } from './use-asset-expense-screen';
import { NotAllowed } from '../../components/not-allowed';
export { type Stage } from './use-asset-expense-screen';

/** The asset-expense screen — moved here unchanged from app/(app)/asset-expense.tsx (a route keeps only its export). */
export function AssetExpenseScreen() {
  const {
    colors,
    COLORS,
    t,
    insets,
    cam,
    camera,
    held,
    loading,
    stage,
    setStage,
    busy,
    sending,
    shot,
    read,
    amount,
    setAmount,
    note,
    setNote,
    category,
    setCategory,
    when,
    setWhen,
    bounds,
    dateProblem,
    spendCategories,
    capture,
    pickFile,
    discardShot,
    cents,
    send,
  } = useAssetExpenseScreen();

  // ── Is this mine at all? ──────────────────────────────────────────────────
  if (loading) {
    return (
      <EquipmentFrame title={t('expenses.title', 'Add a receipt')}>
        <View style={s.centre}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </EquipmentFrame>
    );
  }
  if (!held) {
    /*
      A route is reachable by deep link whether or not a button points at it.
      The server refuses regardless — custody is checked there — but letting
      somebody photograph a slip and only then be refused wastes their time.
    */
    return (
      <EquipmentFrame title={t('expenses.title', 'Add a receipt')}>
        <NotAllowed message={t('expenses.notYours', 'You do not have this one.')} />
      </EquipmentFrame>
    );
  }

  // ── Camera permission ─────────────────────────────────────────────────────
  if (stage === 'camera' && !cam.granted) {
    return (
      <EquipmentFrame title={t('expenses.title', 'Add a receipt')}>
        <MediaAccessScreen purpose="receipt" access={cam} onCancel={() => setStage('review')} />
      </EquipmentFrame>
    );
  }

  // ── Check before sending ──────────────────────────────────────────────────
  if (stage === 'review') {
    return (
      <EquipmentFrame
        title={t('expenses.review', 'Check before sending')}
        onBack={() => {
          discardShot();
          setStage('camera');
        }}
      >
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl + insets.bottom }}>
          <Text style={[s.asset, { color: colors.textMuted }]} numberOfLines={1}>
            {held.asset?.name ?? ''}
          </Text>

          <Field
            colors={colors}
            label={t('expenses.amount', 'Amount')}
            /* Read, or guessed? The distinction IS the safety here: a total the
               slip labelled is a fact, and the biggest figure the reader could
               find is a suggestion that has to be looked at. */
            certain={read?.totalCents?.confidence === 'certain'}
            unknown={!read?.totalCents}
            t={t}
          >
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={colors.textMuted}
              style={[s.input, s.amountInput, { color: colors.textPrimary }]}
            />
          </Field>

          <Field
            colors={colors}
            label={t('expenses.date', 'Date')}
            certain={read?.date?.confidence === 'certain'}
            unknown={!read?.date}
            t={t}
          >
            {/* The logbook's calendar, greying out the days the server refuses. */}
            <DateField
              value={when}
              onChange={(v) => v && setWhen(v)}
              minDate={bounds.minDate}
              maxDate={bounds.maxDate}
              title={t('expenses.date', 'Date')}
              invalid={!!dateProblem}
            />
            {/* A date read off an old slip lands outside the calendar's days; say so beside it. */}
            {dateProblem && <Text style={s.dateProblem}>{dateProblem}</Text>}
          </Field>

          <Text style={[s.label, { color: colors.textMuted }]}>{t('expenses.category', 'What for')}</Text>
          <View style={s.chips}>
            {spendCategories.map((c) => (
              <TouchableOpacity
                key={c.label}
                onPress={() => setCategory(c.label)}
                style={[
                  s.chip,
                  { borderColor: colors.border },
                  category === c.label && { backgroundColor: `${COLORS.primary}1a`, borderColor: COLORS.primary },
                ]}
              >
                <Text
                  style={{
                    fontSize: FONT_SIZE.sm,
                    color: category === c.label ? COLORS.primary : colors.textPrimary,
                    fontWeight: category === c.label ? '700' : '400',
                  }}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.label, { color: colors.textMuted, marginTop: SPACING.lg }]}>
            {t('expenses.note', 'Note')}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('expenses.notePh', 'Where, or what for')}
            placeholderTextColor={colors.textMuted}
            style={[s.input, s.boxed, { color: colors.textPrimary, borderColor: colors.border }]}
          />

          <CaptureReviewFoot
            shot={!!shot}
            icon="image"
            attachedLabel={t('expenses.photoAttached', 'Photo attached')}
            missingLabel={t('expenses.noPhoto', 'No photo')}
            onRetake={() => {
              discardShot();
              setStage('camera');
            }}
            onSend={send}
            sendDisabled={sending || !cents || !category}
            ready={!!(cents && category)}
            sending={sending}
            sendLabel={t('expenses.send', 'Send it in')}
            sendLabelColor={COLORS.onPrimary}
            footnote={t('expenses.pendingHint', 'It counts once the office accepts it.')}
            primary={COLORS.primary}
            border={colors.border}
            muted={colors.textMuted}
          />
        </ScrollView>
      </EquipmentFrame>
    );
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  return (
    <CaptureCamera
      cameraRef={camera}
      title={held.asset?.name ?? ''}
      hint={t('expenses.aim', 'Get the whole slip in shot')}
      onCapture={capture}
      busy={busy}
    >
      {/*
        Two ways in, and the camera is still the primary one — it is what a
        driver at a pump has. "Choose a file" is for the invoice that
        arrived by email, which is the only way a PDF ever gets here.
      */}
      <CaptureSkip label={t('expenses.chooseFile', 'Choose a file')} onPress={pickFile} disabled={busy} />
      <CaptureSkip label={t('expenses.typeInstead', 'Type it instead')} onPress={() => setStage('review')} />
    </CaptureCamera>
  );
}

/** One value, with how confident the reader is about it. */
export function Field({
  colors,
  label,
  certain,
  unknown,
  t,
  children,
}: {
  colors: FieldColors;
  label: string;
  certain: boolean;
  unknown: boolean;
  t: (k: string, d: string, o?: Record<string, unknown>) => string;
  children: React.ReactNode;
}) {
  const border = unknown ? colors.border : certain ? 'rgba(22,163,74,.45)' : 'rgba(245,158,11,.5)';
  return (
    <View style={[s.field, { borderColor: border }]}>
      <View style={s.fieldHead}>
        <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
        {!unknown && (
          <Text style={[s.badge, certain ? s.badgeOk : s.badgeCheck]}>
            {certain ? t('scan.found', 'FOUND') : t('scan.check', 'CHECK')}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  hint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },
  asset: { fontSize: FONT_SIZE.sm, marginBottom: SPACING.md },

  field: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  badge: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    overflow: 'hidden',
  },
  badgeOk: { color: '#4ade80', backgroundColor: 'rgba(22,163,74,.16)' },
  badgeCheck: { color: '#fbbf24', backgroundColor: 'rgba(245,158,11,.16)' },
  input: { fontSize: FONT_SIZE.base, paddingVertical: 6 },
  amountInput: { fontSize: 26, fontWeight: '700' },
  dateProblem: { color: COLORS.error, fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
  boxed: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10 },

  label: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: SPACING.md, paddingVertical: 8 },
});
