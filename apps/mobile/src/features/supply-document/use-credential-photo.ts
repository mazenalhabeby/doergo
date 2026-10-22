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
import type { ScannedDocument } from '../../components/document-scanner';
import { MAX_BYTES, safeFileSize, toIsoDate, type PickFromGallery } from './supply-helpers';
import { useCredentialPhotoData } from './use-credential-photo-data';

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
  const {
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
  } = useCredentialPhotoData({ type, setBusy, pickFromGallery });

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
          body.$front = (
            await offline.files.keep({
              id: uuidv7(),
              kind: 'document',
              mime: front.converted ? 'image/jpeg' : photo.mimeType || 'image/jpeg',
              uri: front.uri,
            })
          ).id;
        }
        if (staged?.back?.key) body.backStagingKey = staged.back.key;
        else if (back) body.$back = (await offline.files.keep({ id: uuidv7(), kind: 'document', mime: 'image/jpeg', uri: back.uri })).id;

        const { outcome } = await createFromPhone(offline.engine, { op: 'document.supply', lane: `document:${type.id}`, body });
        if (outcome.kind === 'refused') {
          toast.error(
            (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
              outcome.message ||
              t('documents.supply.failed'),
          );
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
