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
import { createFromPhone } from '../../offline/actions/queued-create';
import { uuidv7 } from '../../offline/ids';
import type { ScannedDocument } from '../document-scanner';
import { MAX_BYTES, safeFileSize, toIsoDate, type PickFromGallery } from './supply-helpers';

/**
 * A credential — a card, a licence, a passport — photographed, read and sent.
 *
 * Everything that belongs to the ONE photo lives here: the photo, what was read
 * off it, its staged upload and the submit that files it. Sheets of paper are
 * `use-paper-pages.ts`; the sheet decides by the type which one is shown.
 */
export function useCredentialPhoto({
  type,
  setBusy,
  pickFromGallery,
}: {
  type: DocumentType | undefined;
  setBusy: (busy: boolean) => void;
  pickFromGallery: PickFromGallery;
}) {
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

  /**
   * A photo the member already has.
   *
   * The quieter of the two routes: somebody handed a scan by email should not
   * have to photograph their screen. Scanning is what the button above does,
   * and it is the one that produces a straight, complete image.
   */
  const pickExisting = async () => {
    const fromGallery = await pickFromGallery('id-document');
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

  /** The scanner's result: it becomes the photo, and is read at once. */
  const onScanned = (result: ScannedDocument) => {
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
    if (type) void uploadAndRead(picked, type, result.crop, result.back);
  };

  /** True once the document is filed or queued — the sheet then resets and closes. */
  const submit = async (): Promise<boolean> => {
    if (!type || !photo) return false;
    /*
      ⚠️ NO LONGER REFUSED FOR A MISSING DATE.

      The reader tries the machine-readable zone, then the printed text; when
      both come up empty the member was blocked — someone standing in a van
      holding a licence, told to type a date off a document they are trying to
      photograph. An unfiled licence is worth strictly less than a filed one
      with its date still to be confirmed.

      The obligation moves rather than disappears: the document goes to the
      verification queue, and the server will not APPROVE a type that has an
      expiry until the reviewer — who has the image on a desktop screen —
      supplies one. Until then it stands as EXPIRY_UNKNOWN on the compliance
      board, which is chased, not silently counted as covered.
    */
    setBusy(true);
    try {
      if (offline.engine && offline.files) {
        /*
          Filed through the outbox, so it survives no signal and is filed once.
          What was already uploaded while the date was being read goes as its
          key; what was not is kept on the phone and uploaded when sent — and
          the copy is deleted the moment the document is filed. It is a
          photograph of somebody's passport.
        */
        const back = scanned?.back ?? null;
        const body: Record<string, unknown> = {
          typeId: type.id,
          title: type.label,
          ...(expiresOn ? { expiresOn: toIsoDate(expiresOn) } : {}),
          ...(scanned?.barcodeData ? { mrzText: scanned.barcodeData } : {}),
          ...((staged?.crop ?? scanned?.crop) ? { crop: staged?.crop ?? scanned?.crop } : {}),
          ...((staged?.back?.crop ?? back?.crop) ? { backCrop: staged?.back?.crop ?? back?.crop } : {}),
        };
        if (staged?.key) body.stagingKey = staged.key;
        else {
          // Kept for the queue as JPEG — a HEIC queued offline is just as unreadable later.
          const front = await ensureJpeg(photo.uri, photo.mimeType);
          body.$front = (await offline.files.keep({ id: uuidv7(), kind: 'document', mime: front.converted ? 'image/jpeg' : photo.mimeType || 'image/jpeg', uri: front.uri })).id;
        }
        if (staged?.back?.key) body.backStagingKey = staged.back.key;
        else if (back) body.$back = (await offline.files.keep({ id: uuidv7(), kind: 'document', mime: 'image/jpeg', uri: back.uri })).id;

        const { outcome } = await createFromPhone(offline.engine, { op: 'document.supply', lane: `document:${type.id}`, body });
        if (outcome.kind === 'refused') {
          toast.error((outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('documents.supply.failed'));
          setBusy(false);
          return false;
        }
        toast.success(outcome.kind === 'queued' ? t('offline.savedForLater') : t('documents.supply.submitted'));
        return true;
      }

      // Already uploaded while the member was confirming the date.
      const key = staged?.key ?? (await (async () => {
        const jpeg = await ensureJpeg(photo.uri, photo.mimeType);
        const mime = jpeg.converted ? 'image/jpeg' : photo.mimeType || 'image/jpeg';
        const p = await documentsApi.ownUploadUrl({
          typeId: type.id,
          mimeType: mime,
          sizeBytes: jpeg.converted ? jpeg.bytes || photo.fileSize : photo.fileSize,
        });
        await uploadToPresignedUrl(p.url, jpeg.uri, mime);
        return p.key;
      })());

      await documentsApi.submitOwn({
        stagingKey: key,
        typeId: type.id,
        title: type.label,
        // Date only. A timestamp would put an expiry a few hours either side of
        // midnight into the wrong day depending on where the phone is.
        // Sent when known — read off the document or typed. Absent is allowed.
        expiresOn: expiresOn ? toIsoDate(expiresOn) : undefined,
        // Raw, unparsed. The server recomputes the check digits, so a client
        // that invented a zone gets a SUSPECT verdict rather than a pass.
        mrzText: scanned?.barcodeData,
        // The frame, so what is FILED is the document rather than the table it
        // was lying on.
        crop: staged?.crop ?? scanned?.crop ?? null,
        backStagingKey: staged?.back?.key ?? null,
        backCrop: staged?.back?.crop ?? null,
      });
      toast.success(t('documents.supply.submitted'));
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('documents.supply.failed'));
      setBusy(false);
      return false;
    }
  };

  return {
    photo, expiresOn, setExpiresOn, showDate, setShowDate, scanning, setScanning,
    reading, readFields, setOverriding, prompt,
    clearPhoto, pickExisting, onScanned, submit,
  };
}

export type CredentialPhoto = ReturnType<typeof useCredentialPhoto>;
