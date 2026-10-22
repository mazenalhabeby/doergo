import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCalendarDate } from '@hbcfield/shared/client';
import { SPACING } from '../../lib/constants';
import { PressableScale } from '../../components/pressable-scale';
// The app's own calendar, in plain JS. `@react-native-community/datetimepicker`
// would be a NATIVE dependency, and a native dependency means a fresh build
// rather than an over-the-air update — a heavy price for one date field.
import { DatePickerModal } from '../../components/date-picker-modal';
import type { CredentialPhoto } from './use-credential-photo';
import { s, useSupplyPalette } from './styles';

/** A credential: the photo, its expiry read off it, and what happens next. */
export function CredentialSection({ cred }: { cred: CredentialPhoto }) {
  const { t } = useTranslation();
  const { colors, COLORS } = useSupplyPalette();
  const { photo, prompt, readFields, expiresOn } = cred;

  return (
    <>
      {/* The photo */}
      <Text style={[s.eyebrow, { color: colors.textMuted }]}>
        {t('documents.supply.theFile')}
      </Text>
      {photo ? (
        <View style={[s.picked, { backgroundColor: colors.surfaceRaised }]}>
          <View style={[s.pickedIcon, { backgroundColor: COLORS.primary }]}>
            <Ionicons name="checkmark" size={18} color={COLORS.white} />
          </View>
          <Text style={[s.pickedName, { color: colors.textPrimary }]} numberOfLines={1}>
            {photo.fileName}
          </Text>
          <Pressable onPress={cred.clearPhoto} hitSlop={10}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <>
          {/*
            Scanning is the primary way in, and looks like it.

            The OS picker produces a card on a table at an angle with a
            thumb across a corner, and every check downstream then works
            against a bad image. Choosing an existing photo stays — some
            people are handed a scan by email — but it is the quieter of
            the two.

            Quieter as a FILLED button, not a dashed one. A dashed outline
            is the convention for a drop target on a desktop; on a phone
            it just reads as something unfinished.
          */}
          <PressableScale
            onPress={() => cred.setScanning(true)}
            style={[s.scanButton, { backgroundColor: COLORS.primary, shadowColor: COLORS.primary }]}
          >
            <Ionicons name="scan-outline" size={22} color={COLORS.white} />
            <Text style={s.scanText}>{t('documents.supply.scan')}</Text>
          </PressableScale>
          <PressableScale
            onPress={cred.pickExisting}
            style={[s.pickButton, { backgroundColor: colors.surfaceRaised }]}
          >
            <Ionicons name="images-outline" size={18} color={colors.textSecondary} />
            <Text style={[s.pickText, { color: colors.textSecondary }]}>
              {t('documents.supply.chooseExisting')}
            </Text>
          </PressableScale>
        </>
      )}

      {/* Its expiry — read off the document, not asked for */}
      {prompt.state === 'READING' && (
        <View style={[s.expiryRow, { backgroundColor: colors.surfaceRaised }]}>
          <Ionicons name="hourglass-outline" size={18} color={colors.textMuted} />
          <Text style={[s.expiryReading, { color: colors.textSecondary }]}>
            {t('documents.supply.reading')}
          </Text>
        </View>
      )}

      {prompt.state === 'FOUND' && (
        /*
          STATED, not requested. The date sits here as something the app
          has read, with its provenance beside it — a zone expiry is
          proved by a check digit, a date off printed text is the latest
          one the page happened to show. Both save the typing; only one is
          a fact, and somebody confirming it is entitled to know which.
        */
        <View
          style={[
            s.expiryFound,
            prompt.certainty === 'PROVEN'
              ? { backgroundColor: colors.primaryLight, borderColor: COLORS.primary }
              : { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <View style={s.expiryRow}>
            <Ionicons
              name={prompt.certainty === 'PROVEN' ? 'shield-checkmark' : 'calendar-outline'}
              size={18}
              color={prompt.certainty === 'PROVEN' ? COLORS.primary : colors.textSecondary}
            />
            <Text style={[s.expiryValue, { color: colors.textPrimary }]}>
              {t('documents.supply.expiresOnValue', {
                date: formatCalendarDate(prompt.value),
              })}
            </Text>
          </View>
          <View style={s.expiryFoot}>
            <Text
              style={[
                s.dateNote,
                { color: prompt.certainty === 'PROVEN' ? COLORS.primary : colors.textSecondary },
              ]}
            >
              {prompt.certainty === 'PROVEN'
                ? t('documents.supply.dateFromDocument')
                : t('documents.supply.dateGuessed')}
            </Text>
            <PressableScale onPress={() => cred.setOverriding(true)} style={s.changeDate}>
              <Ionicons name="create-outline" size={13} color={colors.textSecondary} />
              <Text style={[s.changeDateText, { color: colors.textSecondary }]}>
                {t('documents.supply.changeDate')}
              </Text>
            </PressableScale>
          </View>
        </View>
      )}

      {/* What the server read off it — a wrong card is caught here, not by the office. */}
      {readFields && (readFields.holderName || readFields.documentNumber) ? (
        <View
          style={{
            backgroundColor: colors.surfaceRaised,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 4,
            marginTop: SPACING.sm,
          }}>
          {readFields.holderName ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('documents.supply.nameOnIt', 'Name on it')}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 13.5 }}>{readFields.holderName}</Text>
            </View>
          ) : null}
          {readFields.documentNumber ? (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 8,
                borderTopWidth: readFields.holderName ? 1 : 0,
                borderTopColor: colors.border,
              }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('documents.supply.numberOnIt', 'Number')}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 13.5 }}>{readFields.documentNumber}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {prompt.state === 'ASK' && (
        /*
          The last resort, and it says why it is asking. A bare date
          button with no explanation is what the member was given before,
          on every document that was not a passport.
        */
        <>
          <Text style={[s.eyebrow, { color: colors.textMuted }]}>
            {t('documents.supply.expiresOn')}
          </Text>
          <PressableScale
            onPress={() => cred.setShowDate(true)}
            style={[s.dateButton, { backgroundColor: colors.surfaceRaised }]}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={expiresOn ? COLORS.primary : colors.textMuted}
            />
            <Text
              style={[
                s.dateText,
                { color: expiresOn ? colors.textPrimary : colors.textMuted },
                expiresOn && s.dateTextSet,
              ]}
            >
              {expiresOn ? expiresOn.toLocaleDateString() : t('documents.supply.pickDate')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </PressableScale>
          <Text style={[s.dateNote, { color: colors.textSecondary }]}>
            {prompt.reason === 'CORRECTING'
              ? t('documents.supply.dateCorrecting')
              : t('documents.supply.dateNotFound')}
          </Text>
        </>
      )}

      <DatePickerModal
        visible={cred.showDate}
        selectedDate={expiresOn}
        onSelect={(d) => { cred.setExpiresOn(d); cred.setShowDate(false); }}
        onClear={() => { cred.setExpiresOn(null); cred.setShowDate(false); }}
        onClose={() => cred.setShowDate(false)}
        // An expiry date is in the future — the calendar no longer
        // assumes that for everybody.
        title={t('documents.supply.expiresOn')}
      />

      {/* What happens next. Somebody who believes an upload covers them
          for the work finds out on site that it does not. */}
      {/*
        Quiet. A yellow-bordered panel is what a warning looks like, and
        this is not one — the submission worked, it simply is not a
        certificate yet. Shouting it made the calmest sentence on the
        screen the loudest thing on it.
      */}
      <View style={s.notice}>
        <Ionicons name="information-circle" size={16} color={colors.textMuted} />
        <Text style={[s.noticeText, { color: colors.textMuted }]}>
          {t('documents.supply.reviewNotice')}
        </Text>
      </View>
    </>
  );
}
