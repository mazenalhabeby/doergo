import { useCallback } from 'react';
import { router } from 'expo-router';
import { File as FsFile } from 'expo-file-system';
import { forgetHeldAssets } from '../../hooks/use-held-assets';
import { assetsApi, uploadToPresignedUrl } from '../../lib/api';
import { moneyToCents } from '@hbcfield/shared/client';
import { submitExpenseFromPhone } from '../../offline/assets/expense-actions';
import { useQueuedWrite } from '../../offline/actions/queued-write';
import { useAssetExpenseScreenData } from './use-asset-expense-screen-data';
import { caught } from '../../lib/caught';

/** AssetExpenseScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useAssetExpenseScreen() {
  const {
    colors,
    COLORS,
    t,
    toast,
    offline,
    insets,
    assetId,
    cam,
    camera,
    held,
    loading,
    stage,
    setStage,
    busy,
    sending,
    setSending,
    shot,
    setShot,
    uploadedKey,
    setUploadedKey,
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
    occurredAtIso,
    dateProblem,
    spendCategories,
    capture,
    pickFile,
  } = useAssetExpenseScreenData();
  const write = useQueuedWrite();

  const discardShot = useCallback(() => {
    // Whatever was uploaded belongs to the file being discarded; keeping the
    // key would attach the old PDF to the next receipt.
    setUploadedKey(null);
    if (!shot) return;
    try {
      new FsFile(shot.uri).delete();
    } catch {
      /* already gone */
    }
    setShot(null);
  }, [shot]);

  const cents = moneyToCents(amount);

  const send = useCallback(async () => {
    if (!cents || !category) return;
    /*
      A date read off the slip is set without the calendar being opened, so an
      old receipt photographed today reaches here unchecked. Said now, in the
      logbook's words, rather than after a round trip on one bar of signal.
    */
    if (dateProblem) {
      toast.error(dateProblem);
      return;
    }
    setSending(true);
    try {
      const files = offline.files; // starts with the engine — there whenever `write.run` queues
      const outcome = await write.run(
        // Saved on the phone with its receipt; both send themselves.
        (engine) =>
          submitExpenseFromPhone(engine, files!, {
            assetId,
            category,
            amountCents: cents,
            note: note.trim() || undefined,
            occurredAt: occurredAtIso(),
            photo: shot ? { uri: shot.uri, mime: shot.mime } : null,
            uploadedKey,
          }),
        async () => {
          let receiptKey: string | undefined;
          /*
            The slip goes phone → S3 directly. Presigned for THIS asset under a
            prefix that names the organization, and the submit step refuses a key
            outside it — so a key from anywhere else cannot be attached here.

            An upload that fails does NOT stop the expense. The amount and the date
            are what the books need; the photograph is evidence, and losing it to a
            motorway signal must not cost somebody the entry as well.
          */
          if (uploadedKey) {
            /*
              A PDF went up already — it had to, or the server could not have read
              it. Uploading again would put a second identical object in the bucket
              that nothing points at, and pay for the transfer twice on a phone.
            */
            receiptKey = uploadedKey;
          } else if (shot) {
            try {
              const presign = await assetsApi.presignReceipt(assetId, {
                fileName: `receipt-${Date.now()}.jpg`,
                mimeType: shot.mime,
                occurredAt: occurredAtIso(),
              });
              await uploadToPresignedUrl(presign.uploadUrl, shot.uri, shot.mime);
              receiptKey = presign.fileKey;
            } catch {
              toast.info(t('expenses.photoFailed', 'The photo did not upload — sending the amount anyway.'));
            }
          }

          return assetsApi.submitExpense(assetId, {
            category,
            amountCents: cents,
            note: note.trim() || undefined,
            occurredAt: occurredAtIso(),
            receiptKey,
            receiptName: receiptKey ? 'receipt.jpg' : undefined,
            receiptMime: receiptKey ? shot?.mime : undefined,
          });
        },
      );
      if (outcome.kind === 'refused') {
        toast.error(
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
            outcome.message ||
            t('expenses.sendFailed', 'Could not send it'),
        );
        return;
      }
      toast.success(
        outcome.kind === 'queued'
          ? t('offline.savedForLater')
          : t('expenses.sent', 'Sent — the office will confirm it.'),
      );
      discardShot();
      forgetHeldAssets(); // the profile's count and list read this again
      router.back();
    } catch (e: unknown) {
      toast.error(caught(e).message || t('expenses.sendFailed', 'Could not send it'));
    } finally {
      setSending(false);
    }
  }, [
    cents,
    category,
    dateProblem,
    shot,
    assetId,
    occurredAtIso,
    note,
    discardShot,
    t,
    toast,
    write,
    offline.files,
    uploadedKey,
  ]);

  return {
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
  };
}
