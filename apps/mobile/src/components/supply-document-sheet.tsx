import { useCallback, useMemo, useState } from 'react';
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
import { SheetPanel } from './sheet-panel';
import { PressableScale } from './pressable-scale';
// The app's own calendar, in plain JS. `@react-native-community/datetimepicker`
// would be a NATIVE dependency, and a native dependency means a fresh build
// rather than an over-the-air update — a heavy price for one date field.
import { DatePickerModal } from './date-picker-modal';
import { DocumentScanner, type ScannedDocument } from './document-scanner';
import type { Rect } from '@hbcfield/shared/client';

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
  const { pickFromGallery } = useImagePicker();

  const suppliable = useMemo(
    () => types.filter((ty) => ty.direction === 'SUPPLIED' && ty.isActive),
    [types],
  );

  const [typeId, setTypeId] = useState<string>('');
  const [photo, setPhoto] = useState<{ uri: string; mimeType: string; fileSize: number; fileName: string } | null>(null);
  const [expiresOn, setExpiresOn] = useState<Date | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  // Exactly as a barcode encoded it, when the document carried one. Parsed and
  // CHECKED on the server — a client's own reading of it is not evidence.
  const [scanned, setScanned] = useState<ScannedDocument | null>(null);
  /*
    Where the date came from.

    The flow used to demand a typed expiry and then quietly overrule it with
    whatever the server read — busywork followed by a silent override. Now the
    document is read first and the field is filled in, so the member confirms
    rather than types, and the label says whether the app KNOWS the date (a
    machine-readable zone, proved by a check digit) or merely GUESSED it from
    printed text.
  */
  const [dateSource, setDateSource] = useState<'MRZ' | 'TEXT' | 'NOTHING' | null>(null);
  const [reading, setReading] = useState(false);
  const [staged, setStaged] = useState<{ key: string; crop: Rect | null } | null>(null);

  const type = suppliable.find((ty) => ty.id === typeId) ?? suppliable[0];
  const needsDate = !!type?.hasExpiry;

  const reset = () => {
    setPhoto(null);
    setScanned(null);
    setExpiresOn(null);
    setDateSource(null);
    setStaged(null);
    setBusy(false);
  };

  /**
   * A photo the member already has.
   *
   * The quieter of the two routes: somebody handed a scan by email should not
   * have to photograph their screen. Scanning is what the button above does,
   * and it is the one that produces a straight, complete image.
   */
  const pickExisting = async () => {
    const fromGallery = await pickFromGallery();
    const first = Array.isArray(fromGallery) ? fromGallery[0] : fromGallery;
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
    const picked = { ...first, fileSize: size };
    setPhoto(picked);
    // A gallery photo carries no barcode read, so any earlier scan is stale.
    setScanned(null);
    if (type) void uploadAndRead(picked, type);
  };

  /**
   * Upload it and ask what is on it, before anything is filed.
   *
   * The upload has to happen either way, so doing it now costs nothing extra
   * and buys the member a filled-in form.
   */
  const uploadAndRead = useCallback(
    async (
      picked: { uri: string; mimeType: string; fileSize: number },
      forType: DocumentType,
      crop?: Rect | null,
    ) => {
      setReading(true);
      try {
        const presigned = await documentsApi.ownUploadUrl({
          typeId: forType.id,
          mimeType: picked.mimeType || 'image/jpeg',
          sizeBytes: picked.fileSize,
        });
        await uploadToPresignedUrl(presigned.url, picked.uri, picked.mimeType || 'image/jpeg');
        setStaged({ key: presigned.key, crop: crop ?? null });

        const read = await documentsApi.readOwnUpload(presigned.key, crop);
        setDateSource(read.source);
        if (read.expiresOn) setExpiresOn(new Date(read.expiresOn));
      } catch {
        // A failed read is not a failed upload attempt: the member can still
        // type the date and send it. Silence beats an error about OCR.
        setDateSource('NOTHING');
      } finally {
        setReading(false);
      }
    },
    [],
  );

  const submit = async () => {
    if (!type || !photo) return;
    if (needsDate && !expiresOn) {
      toast.error(t('documents.supply.needDate'));
      return;
    }
    setBusy(true);
    try {
      // Already uploaded while the member was confirming the date.
      const key = staged?.key ?? (await (async () => {
        const p = await documentsApi.ownUploadUrl({
          typeId: type.id,
          mimeType: photo.mimeType || 'image/jpeg',
          sizeBytes: photo.fileSize,
        });
        await uploadToPresignedUrl(p.url, photo.uri, photo.mimeType || 'image/jpeg');
        return p.key;
      })());

      await documentsApi.submitOwn({
        stagingKey: key,
        typeId: type.id,
        title: type.label,
        // Date only. A timestamp would put an expiry a few hours either side of
        // midnight into the wrong day depending on where the phone is.
        expiresOn: needsDate && expiresOn ? toIsoDate(expiresOn) : undefined,
        // Raw, unparsed. The server recomputes the check digits, so a client
        // that invented a zone gets a SUSPECT verdict rather than a pass.
        mrzText: scanned?.barcodeData,
        // The frame, so what is FILED is the document rather than the table it
        // was lying on.
        crop: staged?.crop ?? scanned?.crop ?? null,
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
      {/*
        The shared surface. Passing a bare ScrollView to BlurSheet left the
        content floating over the blurred page with no panel behind it — the
        screen it had covered showed through the text.
      */}
      <SheetPanel
        title={t('documents.supply.title')}
        onClose={onClose}
        closeDisabled={busy}
        maxHeightFraction={0.9}
      >
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          {t('documents.supply.subtitle')}
        </Text>

        {/*
          `flexShrink` is what makes this scroll.

          Inside a height-capped panel a ScrollView with no shrink lays out at
          its full content height, and the panel simply clips whatever does not
          fit — so the tail of the form was cut off and unreachable rather than
          scrollable.
        */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
        >

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
              <>
                {/*
                  Scanning is the primary way in, and looks like it.

                  The OS picker produces a card on a table at an angle with a
                  thumb across a corner, and every check downstream then works
                  against a bad image. Choosing an existing photo stays — some
                  people are handed a scan by email — but it is the quieter of
                  the two.
                */}
                <PressableScale
                  onPress={() => setScanning(true)}
                  style={[s.scanButton, { backgroundColor: COLORS.primary }]}
                >
                  <Ionicons name="scan-outline" size={22} color="#fff" />
                  <Text style={s.scanText}>{t('documents.supply.scan')}</Text>
                </PressableScale>
                <PressableScale
                  onPress={pickExisting}
                  style={[s.pickButton, { borderColor: colors.border }]}
                >
                  <Ionicons name="images-outline" size={20} color={colors.textSecondary} />
                  <Text style={[s.pickText, { color: colors.textSecondary }]}>
                    {t('documents.supply.chooseExisting')}
                  </Text>
                </PressableScale>
              </>
            )}

            {/* Its expiry, asked for where it belongs */}
            {needsDate && (
              <>
                <Text style={[s.label, { color: colors.textPrimary }]}>{t('documents.supply.expiresOn')}</Text>
                <PressableScale
                  onPress={() => setShowDate(true)}
                  style={[s.dateButton, { borderColor: expiresOn ? COLORS.primary : colors.border }]}
                >
                  <Ionicons
                    name={reading ? 'hourglass-outline' : 'calendar-outline'}
                    size={18}
                    color={colors.textSecondary}
                  />
                  <Text style={[s.dateText, { color: expiresOn ? colors.textPrimary : colors.textSecondary }]}>
                    {reading
                      ? t('documents.supply.reading')
                      : expiresOn
                        ? expiresOn.toLocaleDateString()
                        : t('documents.supply.pickDate')}
                  </Text>
                </PressableScale>

                {/*
                  Where the date came from, in the member's words.

                  A date the app filled in is a claim the app is making, and
                  somebody about to confirm it deserves to know whether it was
                  READ from a machine-readable zone — proved by a check digit —
                  or GUESSED from printed text, which a driving licence is,
                  because a European licence has no zone at all.
                */}
                {!reading && dateSource === 'MRZ' && expiresOn && (
                  <Text style={[s.dateNote, { color: COLORS.primary }]}>
                    {t('documents.supply.dateFromDocument')}
                  </Text>
                )}
                {!reading && dateSource === 'TEXT' && expiresOn && (
                  <Text style={[s.dateNote, { color: colors.textSecondary }]}>
                    {t('documents.supply.dateGuessed')}
                  </Text>
                )}
                {!reading && dateSource === 'NOTHING' && (
                  <Text style={[s.dateNote, { color: colors.textSecondary }]}>
                    {t('documents.supply.dateNotFound')}
                  </Text>
                )}
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

          </>
        )}
        </ScrollView>

        {/*
          Pinned under the scroll area, not inside it.

          The one control the sheet exists for should not require scrolling to
          reach — on a short phone the form is taller than the sheet, and an
          action that scrolls out of view reads as an action that is missing.
        */}
        {suppliable.length > 0 && (
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
        )}
      </SheetPanel>

      {/*
        Which sides comes from the TYPE, not from what the document proves.

        It used to ask for both whenever the type was a credential, which is
        wrong in both directions: a gas certificate is a credential with nothing
        on its back, and a passport carries its zone on the photo page — so it
        asked people to turn a passport over and photograph the cover.
      */}
      <DocumentScanner
        visible={scanning}
        title={type?.label ?? t('documents.supply.title')}
        twoSided={!!type?.twoSided}
        shape={type?.scanShape ?? 'CARD'}
        onCancel={() => setScanning(false)}
        onDone={(result) => {
          setScanning(false);
          setScanned(result);
          const picked = {
            uri: result.uri,
            fileName: result.fileName,
            mimeType: result.mimeType,
            fileSize: result.fileSize,
          };
          setPhoto(picked);
          // Read it now, while they are still looking at the sheet.
          if (type) void uploadAndRead(picked, type, result.crop);
        }}
      />
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
  scroll: { flexShrink: 1 },
  body: { gap: SPACING.sm, paddingBottom: SPACING.md },
  subtitle: { fontSize: FONT_SIZE.sm, marginTop: SPACING.xs, marginBottom: SPACING.sm },
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
  scanButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    minHeight: 52, borderRadius: RADIUS.md,
  },
  scanText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  pickButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: RADIUS.md, paddingVertical: SPACING.sm,
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
  dateNote: { fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
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
