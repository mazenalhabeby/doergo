import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { ScreenHeader } from '../../components/screen-header';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../lib/constants';
import { ChoiceChip } from '../customer/client-fields';
import { CardFieldRow, CardFieldGroup } from '../customer/card-field-row';
import { CardExtrasGroup } from '../customer/card-extras';
import { CardDestinationPicker } from '../customer/card-destination';
import { DuplicateSheet } from '../customer/card-duplicate';
import {
  cardAlternatives, cardExtrasKept, cardFieldsFor, fieldNeedsLook, homelessFields,
  type CardFieldKey,
} from '../customer/card-review';
import { FIELD_INPUT, FIELD_LABEL, SAVE_LABEL, reasonSaveIsGrey } from './scan-card-copy';
import type { CardReview, useCardReview } from './use-card-review';
import type { useCardSaveFlow } from './use-card-save-flow';

/** The second state of the scanner: what was read, to be checked and saved. */
export function CardReviewScreen({ review, flow }: {
  review: ReturnType<typeof useCardReview> & { read: CardReview };
  flow: ReturnType<typeof useCardSaveFlow>;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const {
    read, kind, why, destination, company, picking,
    setValue, toggleLines, pickLine, renameExtra, setExtraValue, dropExtra,
    chooseDestination, chooseKind, scanAgain,
  } = review;
  const { duplicate, saving, ready, attemptSave, saveAnyway, openExisting, useExistingCompany } = flow;

  /*
    GROUPED BY CONFIDENCE, not listed flat.

    A row needs a look when the reader INFERRED it (`likely` — the name, the
    company, the address, the title), found nothing at all, or was deciding
    between two lines. Everything else it proved by shape, and a proved field
    asking to be checked is how a screen teaches people to stop checking.

    Membership comes from `flagged` — what was true when the card was READ —
    and never from the live value; see the note where it is set.
  */
  const shown = cardFieldsFor(kind, destination);
  const needsLook = shown.filter((key) => read.flagged[key]);
  const captured = shown.filter((key) => !read.flagged[key]);
  const orphans = homelessFields(kind, destination, read.values);

  const row = (key: CardFieldKey) => {
    // A contested field stops asking the moment the member answers it: they
    // have settled what the reader could not.
    const stillContested = !!read.contested[key] && !read.answered[key];
    return (
      <CardFieldRow
        key={key}
        fieldKey={key}
        /* The one label that moves with the kind: on a firm's card the person
           named on it is the CONTACT, not the client. */
        label={key === 'name' && kind === 'COMPANY' ? t('customers.fContact') : t(FIELD_LABEL[key])}
        value={read.values[key]}
        attention={fieldNeedsLook(read.values[key], read.certain[key]) || stillContested}
        keyboardType={FIELD_INPUT[key]?.keyboardType}
        autoCapitalize={FIELD_INPUT[key]?.autoCapitalize}
        lines={read.card.lines}
        // The two lines the reader was nearly persuaded by, offered ahead of
        // the full list — a wrong guess should be one tap to fix.
        alternatives={cardAlternatives(read.card, key)}
        contested={stillContested}
        expanded={picking === key}
        onChange={setValue}
        onToggleLines={toggleLines}
        onPickLine={pickLine}
      />
    );
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
      <ScreenHeader title={t('scan.review')} onBack={scanAgain} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: SPACING.lg,
          /*
            Clears the system bar AND the keyboard.

            Without the keyboard term the field being typed into sits under
            the keyboard on Android, so a member editing a company name
            cannot see what they are typing. The ScrollView can only scroll a
            focused field into view if there is room below it to scroll into.
          */
          paddingBottom: SPACING.xxxl + insets.bottom + keyboard,
        }}
      >
        {/*
          ⚠️ A BAD LOOK IS SAID OUT LOUD, FIRST, BEFORE ANY FIELD.

          The alternative — presenting four confident fields from a photograph
          that half failed — is what makes a reader feel broken rather than
          merely imperfect, because the member has no way to know that
          anything is missing. "Part of this card could not be read" is a
          smaller failure than a client saved without their email.

          The fields stay below and stay editable: this leads, it does not
          block. Somebody standing in a corridor with one card and no second
          chance must still be able to save what did come through.
        */}
        {read.quality.poor && (
          <View style={[s.poor, { borderColor: COLORS.amber }]}>
            <View style={s.poorHead}>
              <Ionicons name="alert-circle-outline" size={18} color={COLORS.amber} />
              <Text style={s.poorTitle}>{t('scan.poorRead')}</Text>
            </View>
            <Text style={[s.poorBody, { color: colors.textMuted }]}>
              {/*
                ⚠️ `lines`, NOT `count`. i18next reads `count` as a plural
                selector and looks for `poorReadHint_one` / `_other` first —
                it falls back to this key when they are absent, so it works
                by luck, and stops working the day somebody adds a plural
                form in one language and not the other four.
              */}
              {t('scan.poorReadHint', { lines: read.quality.lines })}
            </Text>
            <TouchableOpacity onPress={scanAgain} style={s.poorBtn} accessibilityRole="button">
              <Ionicons name="camera-outline" size={16} color={COLORS.white} />
              <Text style={s.poorBtnText}>{t('scan.again')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/*
          ONE QUESTION, AT THE TOP, WITH ITS REASON.

          Everything below it — which fields are offered, where the person is
          filed, what the save even calls — follows from this answer, so it is
          asked first and it says why it guessed what it guessed. A guess that
          does not explain itself gets ignored rather than corrected.
        */}
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t('scan.cardKind')}</Text>
        <View style={s.kindRow}>
          <ChoiceChip
            label={t('scan.kindCompany')}
            selected={kind === 'COMPANY'}
            onPress={() => chooseKind('COMPANY')}
          />
          <ChoiceChip
            label={t('scan.kindPerson')}
            selected={kind === 'PERSON'}
            onPress={() => chooseKind('PERSON')}
          />
        </View>
        <Text style={[s.why, { color: colors.textMuted }]}>{t(`scan.why.${why}`)}</Text>

        {needsLook.length > 0 && (
          <CardFieldGroup title={t('scan.needsLook')} hint={t('scan.needsLookHint')}>
            {needsLook.map((key) => row(key))}
          </CardFieldGroup>
        )}

        {captured.length > 0 && (
          <CardFieldGroup title={t('scan.captured')}>
            {captured.map((key) => row(key))}
          </CardFieldGroup>
        )}

        {/* What the card said that no field wanted — kept, named and editable
            rather than dropped in silence. See `card-extras.tsx`. */}
        <CardExtrasGroup
          rows={read.extras}
          kept={cardExtrasKept(destination)}
          onRename={renameExtra}
          onChangeValue={setExtraValue}
          onRemove={dropExtra}
        />

        {/* A person has somewhere to BE. A company is already the client. */}
        {kind === 'PERSON' && (
          <CardDestinationPicker
            companyGuess={read.values.company}
            companySuggestion={read.card.companySuggestion}
            destination={destination}
            company={company}
            onChange={chooseDestination}
          />
        )}

        {/*
          ⚠️ What was read and cannot be kept, said out loud.

          This line is the whole point of the rebuild. The reader extracts
          more than any one record can hold — a person's own website, a firm's
          VAT number on a person's card, a job title with no company to hold
          it — and the screen that binned those silently is the bug being
          fixed. Naming them tells the member the one thing they can act on:
          the other kind, or the other destination, would keep it.
        */}
        {orphans.length > 0 && (
          <Text style={[s.orphans, { color: colors.textMuted }]}>
            {t('scan.notSaved', { fields: orphans.map((key) => t(FIELD_LABEL[key])).join(', ') })}
          </Text>
        )}

        <TouchableOpacity
          onPress={attemptSave}
          disabled={saving || !ready}
          style={[s.primary, { backgroundColor: ready ? COLORS.primary : colors.border }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || !ready, busy: saving }}
        >
          {saving ? <ActivityIndicator size="small" color={COLORS.white} />
                  : <Text style={s.primaryText}>{t(SAVE_LABEL[destination])}</Text>}
        </TouchableOpacity>
        {/* The reason Save is still grey, rather than a button that does
            nothing when pressed. */}
        {!ready && (
          <Text style={[s.why, { color: colors.textMuted, textAlign: 'center' }]}>
            {t(reasonSaveIsGrey(destination, !!company, read.values))}
          </Text>
        )}
        <TouchableOpacity style={s.ghost} onPress={scanAgain}>
          <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.sm }}>{t('scan.again')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <DuplicateSheet
        matches={duplicate.matches}
        saving={saving}
        onOpen={openExisting}
        // Only when a NEW COMPANY is what would be created: everywhere else
        // the member is making a client, and opening the one that exists is
        // what they wanted.
        onUse={destination === 'newCompany' ? useExistingCompany : undefined}
        onSaveAnyway={saveAnyway}
        onClose={duplicate.dismiss}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  /* The review's own furniture. The field row brings its own — see
     `card-field-row.tsx`, which is the single component every field uses. */
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  kindRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  why: { fontSize: FONT_SIZE.sm, lineHeight: 18, marginTop: SPACING.sm },
  orphans: { fontSize: FONT_SIZE.sm, lineHeight: 18, marginTop: SPACING.xl },

  /* The bad-read warning. Bordered and boxed — the ONE thing on this screen
     that is, because it is the one thing that must not be scrolled past. */
  poor: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.amberLight,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.xs,
  },
  poorHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  poorTitle: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: COLORS.amber },
  poorBody: { fontSize: FONT_SIZE.sm, lineHeight: 18 },
  poorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.amber,
    borderRadius: RADIUS.sm,
    height: 40,
    marginTop: SPACING.xs,
  },
  poorBtnText: { color: COLORS.white, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  primary: { borderRadius: RADIUS.md, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.xl },
  primaryText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  ghost: { alignItems: 'center', paddingVertical: SPACING.md },
});
