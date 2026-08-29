import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { useToast } from '../contexts/toast-context';
import { useImagePicker } from '../hooks/useImagePicker';
import { File as FsFile } from 'expo-file-system';
import { documentsApi, type DocumentType } from '../lib/api/documents';
import { uploadToPresignedUrl } from '../lib/api/attachments';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { BlurSheet } from './blur-sheet';
import { PressableScale } from './pressable-scale';
// The app's own calendar, in plain JS. `@react-native-community/datetimepicker`
// would be a NATIVE dependency, and a native dependency means a fresh build
// rather than an over-the-air update — a heavy price for one date field.
import { DatePickerModal } from './date-picker-modal';

/**
 * The member supplying a document from their phone.
 *
 * This is the half of the personnel file that belongs on mobile. A payslip is
 * read at a desk; a driving licence is PHOTOGRAPHED, and the camera is here.
 * Requiring the office to upload it means somebody emails a photo, somebody
 * else files it a week later, and the expiry date is whatever was typed.
 *
 * Three things it is careful about, mirroring the web:
 *
 *   it offers only types the organization asks members for
 *   it takes the expiry date in the same breath as the photo
 *   it says plainly that this is a submission, not a certificate
 */

const MAX_BYTES = 20 * 1024 * 1024;

export function SupplyDocumentSheet({
  types,
  visible,
  onClose,
  onSubmitted,
}: {
  types: DocumentType[];
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const { takePhoto, pickFromGallery } = useImagePicker();

  const suppliable = useMemo(
    () => types.filter((ty) => ty.direction === 'SUPPLIED' && ty.isActive),
    [types],
  );

  const [typeId, setTypeId] = useState<string>('');
  const [photo, setPhoto] = useState<{ uri: string; mimeType: string; fileSize: number; fileName: string } | null>(null);
  const [expiresOn, setExpiresOn] = useState<Date | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [busy, setBusy] = useState(false);

  const type = suppliable.find((ty) => ty.id === typeId) ?? suppliable[0];
  const needsDate = !!type?.hasExpiry;

  const reset = () => {
    setPhoto(null);
    setExpiresOn(null);
    setBusy(false);
  };

  const take = async (from: 'camera' | 'gallery') => {
    const picked = from === 'camera' ? await takePhoto() : await pickFromGallery();
    const first = Array.isArray(picked) ? picked[0] : picked;
    if (!first) return;

    /*
      The size has to be EXACT, not approximate.

      The presigned URL signs `content-length`, so a declared size that differs
      from the bytes actually sent is rejected by the object store as a
      signature mismatch — a 403 with nothing in it about sizes. The image
      picker reports `fileSize: 0` on some Android devices, which would declare
      one byte and fail every upload from those phones.
    */
    const size = first.fileSize || safeFileSize(first.uri);
    if (!size) {
      toast.error(t('documents.supply.failed'));
      return;
    }
    // Checked here as well as on the server: a 20 MB photo that fails after
    // uploading over a site connection is a minute of somebody's time for
    // nothing.
    if (size > MAX_BYTES) {
      toast.error(t('documents.supply.tooLarge'));
      return;
    }
    setPhoto({ ...first, fileSize: size });
  };

  const submit = async () => {
    if (!type || !photo) return;
    if (needsDate && !expiresOn) {
      toast.error(t('documents.supply.needDate'));
      return;
    }
    setBusy(true);
    try {
      const presigned = await documentsApi.ownUploadUrl({
        typeId: type.id,
        mimeType: photo.mimeType || 'image/jpeg',
        sizeBytes: photo.fileSize,
      });
      await uploadToPresignedUrl(presigned.url, photo.uri, photo.mimeType || 'image/jpeg');
      await documentsApi.submitOwn({
        stagingKey: presigned.key,
        typeId: type.id,
        title: type.label,
        // Date only. A timestamp would put an expiry a few hours either side of
        // midnight into the wrong day depending on where the phone is.
        expiresOn: needsDate && expiresOn ? toIsoDate(expiresOn) : undefined,
      });
      toast.success(t('documents.supply.submitted'));
      reset();
      onSubmitted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('documents.supply.failed'));
      setBusy(false);
    }
  };

  return (
    <BlurSheet visible={visible} onClose={busy ? () => {} : onClose}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={[s.title, { color: colors.textPrimary }]}>{t('documents.supply.title')}</Text>
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          {t('documents.supply.subtitle')}
        </Text>

        {suppliable.length === 0 ? (
          <Text style={[s.empty, { color: colors.textSecondary }]}>
            {t('documents.supply.nothingToSupply')}
          </Text>
        ) : (
          <>
            {/* What it is */}
            <Text style={[s.label, { color: colors.textPrimary }]}>{t('documents.supply.whatIsIt')}</Text>
            <View style={s.typeList}>
              {suppliable.map((ty) => {
                const on = ty.id === type?.id;
                return (
                  <PressableScale
                    key={ty.id}
                    onPress={() => setTypeId(ty.id)}
                    style={[
                      s.typeRow,
                      { borderColor: on ? COLORS.primary : colors.border,
                        backgroundColor: on ? `${COLORS.primary}14` : 'transparent' },
                    ]}
                  >
                    <Ionicons
                      name={on ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={on ? COLORS.primary : colors.textSecondary}
                    />
                    <View style={s.typeText}>
                      <Text style={[s.typeLabel, { color: colors.textPrimary }]}>{ty.label}</Text>
                      {!!ty.description && (
                        <Text style={[s.typeHint, { color: colors.textSecondary }]} numberOfLines={2}>
                          {ty.description}
                        </Text>
                      )}
                    </View>
                  </PressableScale>
                );
              })}
            </View>

            {/* The photo */}
            <Text style={[s.label, { color: colors.textPrimary }]}>{t('documents.supply.theFile')}</Text>
            {photo ? (
              <View style={[s.picked, { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}14` }]}>
                <Ionicons name="document-attach-outline" size={20} color={COLORS.primary} />
                <Text style={[s.pickedName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {photo.fileName}
                </Text>
                <Pressable onPress={() => setPhoto(null)} hitSlop={10}>
                  <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <View style={s.pickRow}>
                <PressableScale
                  onPress={() => take('camera')}
                  style={[s.pickButton, { borderColor: colors.border }]}
                >
                  <Ionicons name="camera-outline" size={22} color={COLORS.primary} />
                  <Text style={[s.pickText, { color: colors.textPrimary }]}>
                    {t('documents.supply.takePhoto')}
                  </Text>
                </PressableScale>
                <PressableScale
                  onPress={() => take('gallery')}
                  style={[s.pickButton, { borderColor: colors.border }]}
                >
                  <Ionicons name="images-outline" size={22} color={COLORS.primary} />
                  <Text style={[s.pickText, { color: colors.textPrimary }]}>
                    {t('documents.supply.chooseExisting')}
                  </Text>
                </PressableScale>
              </View>
            )}

            {/* Its expiry, asked for where it belongs */}
            {needsDate && (
              <>
                <Text style={[s.label, { color: colors.textPrimary }]}>{t('documents.supply.expiresOn')}</Text>
                <PressableScale
                  onPress={() => setShowDate(true)}
                  style={[s.dateButton, { borderColor: expiresOn ? COLORS.primary : colors.border }]}
                >
                  <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                  <Text style={[s.dateText, { color: expiresOn ? colors.textPrimary : colors.textSecondary }]}>
                    {expiresOn ? expiresOn.toLocaleDateString() : t('documents.supply.pickDate')}
                  </Text>
                </PressableScale>
                <DatePickerModal
                  visible={showDate}
                  selectedDate={expiresOn}
                  onSelect={(d) => { setExpiresOn(d); setShowDate(false); }}
                  onClear={() => { setExpiresOn(null); setShowDate(false); }}
                  onClose={() => setShowDate(false)}
                  title={t('documents.supply.expiresOn')}
                />
              </>
            )}

            {/* What happens next. Somebody who believes an upload covers them
                for the work finds out on site that it does not. */}
            <View style={[s.notice, { backgroundColor: `${COLORS.warning}18`, borderColor: `${COLORS.warning}55` }]}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.warning} />
              <Text style={[s.noticeText, { color: colors.textPrimary }]}>
                {t('documents.supply.reviewNotice')}
              </Text>
            </View>

            <PressableScale
              onPress={submit}
              disabled={!photo || busy}
              style={[
                s.submit,
                { backgroundColor: COLORS.primary, opacity: !photo || busy ? 0.5 : 1 },
              ]}
            >
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitText}>{t('documents.supply.send')}</Text>}
            </PressableScale>
          </>
        )}
      </ScrollView>
    </BlurSheet>
  );
}

/** The file's real length, or 0 if it cannot be read. Never throws at the caller. */
function safeFileSize(uri: string): number {
  try {
    return new FsFile(uri).size ?? 0;
  } catch {
    return 0;
  }
}

/** A calendar date, in the phone's own day — never a UTC-shifted one. */
function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const s = StyleSheet.create({
  body: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.xl },
  title: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  subtitle: { fontSize: FONT_SIZE.sm, marginBottom: SPACING.sm },
  empty: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: SPACING.xl },
  label: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACING.sm },
  typeList: { gap: SPACING.xs },
  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm,
  },
  typeText: { flex: 1 },
  typeLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },
  typeHint: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  pickRow: { flexDirection: 'row', gap: SPACING.sm },
  pickButton: {
    flex: 1, alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: RADIUS.md, paddingVertical: SPACING.md,
  },
  pickText: { fontSize: FONT_SIZE.sm },
  picked: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md,
  },
  pickedName: { flex: 1, fontSize: FONT_SIZE.sm },
  dateButton: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md,
  },
  dateText: { fontSize: FONT_SIZE.md },
  notice: {
    flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start',
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.sm,
  },
  noticeText: { flex: 1, fontSize: FONT_SIZE.sm, lineHeight: 20 },
  submit: {
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
    minHeight: 52, borderRadius: RADIUS.md, marginTop: SPACING.sm,
  },
  submitText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
});
