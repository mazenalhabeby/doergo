import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { expiryPrompt, type Rect } from '@hbcfield/shared/client';
import { useToast } from '../../island/island-context';
import { ensureJpeg } from '../../lib/page-upload';
import { documentsApi, type DocumentType } from '../../lib/api/documents';
import { uploadToPresignedUrl } from '../../lib/api/attachments';
import { canReadText } from '../../lib/ocr';
import { readExpiryOnDevice } from '../../lib/document-scan';
import { useOffline } from '../../offline/offline-context';
import type { ScannedDocument } from '../document-scanner';
import { toIsoDate, type PickFromGallery } from './supply-helpers';

/** useCredentialPhoto's state and handlers — everything before its markup, moved here unchanged. */
export function useCredentialPhotoData({
  type,
  setBusy,
  pickFromGallery,
}: Pick<{
  type: DocumentType | undefined;
  setBusy: (busy: boolean) => void;
  pickFromGallery: PickFromGallery;
}, 'type' | 'setBusy' | 'pickFromGallery'>) {
  const { t } = useTranslation();
  const toast = useToast();
  const offline = useOffline();

  const [photo, setPhoto] = useState<{ uri: string; mimeType: string; fileSize: number; fileName: string } | null>(null);
  const [expiresOn, setExpiresOn] = useState<Date | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [scanning, setScanning] = useState(false);
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
  /* The name and number the server read — shown so a wrong card is caught before it is sent. */
  const [readFields, setReadFields] = useState<{ holderName: string | null; documentNumber: string | null } | null>(null);
  /*
    The member has asked to set the date themselves.

    Being certain is not the same as being right — a card photographed at an
    angle produces a confident wrong answer — so the correction is always one
    tap away. Never entered automatically: an app that quietly reopens the
    field it just filled in has saved nobody anything.
  */
  const [overriding, setOverriding] = useState(false);
  const [staged, setStaged] = useState<{
    key: string;
    crop: Rect | null;
    back?: { key: string; crop: Rect | null } | null;
  } | null>(null);

  /*
    One rule, shared with the web.

    Both surfaces had the reading wired and both still LED with the picker:
    `needsDate` was `!!type?.hasExpiry` alone, so "Expires on — pick a date"
    rendered the moment a type was chosen, before any photo existed, for a date
    printed on the document about to be photographed. Filling it in afterwards
    does not undo that — by then somebody has tapped through a calendar.
  */
  const prompt = expiryPrompt({
    hasExpiry: !!type?.hasExpiry,
    hasFile: !!photo,
    reading,
    source: dateSource,
    value: expiresOn ? toIsoDate(expiresOn) : null,
    overriding,
  });

  /*
    ⚠️ Everything read off a photo goes WITH the photo. Removing it used to keep
    its date, its staged upload and its barcode, so the next photo was sent
    with the last one's expiry.
  */
  const clearPhoto = () => {
    setPhoto(null);
    setScanned(null);
    setExpiresOn(null);
    setDateSource(null);
    setOverriding(false);
    setStaged(null);
    setReadFields(null);
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
      back?: { uri: string; fileSize: number; crop?: Rect } | null,
    ) => {
      setReading(true);
      try {
        /*
          READ IT HERE FIRST, before a single byte goes anywhere.

          ⚠️ This flow used to upload the photograph and ask the SERVER what was
          on it — tesseract, over the wire, after the upload finished — while
          ML Kit sat unused in the member's pocket, already reading business
          cards, fuel receipts and rental agreements in this same app. A member
          on a yard's worth of signal watched a spinner for the length of an
          upload to learn a date their phone could have read instantly.

          On-device is better on every axis that matters here: it is immediate,
          it works with one bar, it costs nothing per document, and ML Kit reads
          a photographed page more accurately than tesseract does.

          ⚠️ IT DOES NOT REPLACE THE SERVER READ, and must not. The zone's check
          digits, and whether the name on the document is the member's, are
          EVIDENCE — and a client's own reading of its own document is not
          evidence. The phone fills the field; the server still decides the
          verdict, on bytes it fetched itself.
        */
        const onDevice = canReadText() ? await readExpiryOnDevice(picked.uri) : null;
        if (onDevice) {
          setDateSource('TEXT');
          setExpiresOn(new Date(onDevice));
        }

        const put = async (uri: string, sizeBytes: number) => {
          // An iPhone HEIC goes up as JPEG — the server cannot read HEIC at all.
          const jpeg = await ensureJpeg(uri, uri === picked.uri ? picked.mimeType : null);
          const p = await documentsApi.ownUploadUrl({
            typeId: forType.id,
            mimeType: 'image/jpeg',
            sizeBytes: jpeg.converted ? jpeg.bytes || sizeBytes : sizeBytes,
          });
          await uploadToPresignedUrl(p.url, jpeg.uri, 'image/jpeg');
          return p.key;
        };

        const presigned = { key: await put(picked.uri, picked.fileSize) };
        /*
          Both sides go up.

          The back was being captured and thrown away, which for a card is the
          half that can be read at all — the categories and the machine-readable
          zone are there, and the front has neither.
        */
        const backKey = back ? await put(back.uri, back.fileSize) : null;

        setStaged({
          key: presigned.key,
          crop: crop ?? null,
          back: backKey ? { key: backKey, crop: back?.crop ?? null } : null,
        });

        const read = await documentsApi.readOwnUpload(
          presigned.key,
          crop,
          backKey ? { stagingKey: backKey, crop: back?.crop ?? null } : null,
        );
        /*
          The server's answer wins where it HAS one.

          A zone expiry is proved by a check digit and the phone's reading of
          printed text is not, so MRZ must overrule it. Where the server found
          nothing, what the phone read is kept rather than being wiped back to
          "nothing readable" — losing a date already on screen because a second,
          weaker reader missed it would be the worst of both.
        */
        setReadFields(read.fields ?? null);
        if (read.expiresOn) {
          setDateSource(read.source);
          setExpiresOn(new Date(read.expiresOn));
        } else if (!onDevice) {
          setDateSource(read.source);
        }
      } catch {
        // A failed read is not a failed upload attempt: the member can still
        // type the date and send it. Silence beats an error about OCR.
        // ⚠️ Only when the phone found nothing either — the upload can fail
        // long after a perfectly good on-device read.
        setDateSource((prev) => (prev === 'TEXT' ? prev : 'NOTHING'));
      } finally {
        setReading(false);
      }
    },
    [],
  );

  return {
    t,
    toast,
    offline,
    photo,
    setPhoto,
    expiresOn,
    setExpiresOn,
    showDate,
    setShowDate,
    scanning,
    setScanning,
    scanned,
    setScanned,
    reading,
    readFields,
    setOverriding,
    staged,
    prompt,
    clearPhoto,
    uploadAndRead,
  };
}
