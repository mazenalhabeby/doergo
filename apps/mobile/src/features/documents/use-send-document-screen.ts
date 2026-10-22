import { useCallback, useRef, useState } from 'react';
import { CameraView } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File as FsFile } from 'expo-file-system';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useCameraAccess } from '../../permissions/use-media-access';
import { canScanContracts, scanContract } from '../../lib/receipt-scan';
import { assetProposalsApi, uploadToPresignedUrl, type ContractFields } from '../../lib/api';
import { classifyDocument, type DocumentClassification } from '@hbcfield/shared/client';
import { useOffline } from '../../offline/offline-context';
import { createFromPhone } from '../../offline/actions/queued-create';
import { useQueuedWrite } from '../../offline/actions/queued-write';
import { uuidv7 } from '../../offline/ids';
import { caught } from '../../lib/caught';

/**
 * Send a page in and let somebody responsible decide.
 *
 * A driver is handed a rental agreement at a desk. They cannot create assets —
 * creating a record, reassigning the organization's property and taking a
 * vehicle off the books is not theirs to do, and never will be. What they can
 * do is photograph the page, and the alternative to this screen is the paper
 * living in the door pocket until somebody types it in March.
 *
 * ⚠️ THE TEXT NEVER LEAVES THIS PHONE. The reading happens on the device; a
 * rental agreement carries the member's home address, their licence number and
 * their bank details, and the organization gets the six fields that describe
 * the vehicle. The PAGE itself is uploaded — a reviewer has to be able to check
 * the reading against it — and that is a deliberate, visible trade the screen
 * states rather than a side effect.
 *
 * ⚠️ AND THE READER CAN SAY NO. A page it does not recognise is offered as
 * "send it anyway", never dressed up as a contract: putting a proposal for a
 * vehicle that does not exist in somebody's queue is how the queue stops being
 * read, which costs the real ones too.
 */

export type Stage = 'camera' | 'review';

/** SendDocumentScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useSendDocumentScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const offline = useOffline();
  const write = useQueuedWrite();
  const insets = useSafeAreaInsets();
  const cam = useCameraAccess();
  const camera = useRef<CameraView>(null);

  const [stage, setStage] = useState<Stage>('camera');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const [shot, setShot] = useState<{ uri: string; mime: string } | null>(null);
  const [verdict, setVerdict] = useState<DocumentClassification | null>(null);
  const [fields, setFields] = useState<ContractFields>({});

  const capture = useCallback(async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      // ⚠️ Never `skipProcessing` — the reader's line ORDER comes from the y
      // coordinate, and a sideways page swaps every label with its value.
      const picture = await camera.current.takePictureAsync({ quality: 0.7 });
      if (!picture?.uri) return;
      setShot({ uri: picture.uri, mime: 'image/jpeg' });

      if (canScanContracts()) {
        const { lines } = await scanContract(picture.uri);
        const c = classifyDocument(lines);
        setVerdict(c);
        setFields({
          registration: c.contract.registration?.value ?? '',
          vin: c.contract.vin?.value ?? '',
          manufacturer: c.contract.manufacturer?.value ?? '',
          model: c.contract.model?.value ?? '',
          startsOn: c.contract.startsOn?.value ?? '',
          endsOn: c.contract.endsOn?.value ?? '',
        });
      }
      setStage('review');
    } catch {
      toast.error(t('sendDoc.readFailed', 'Could not read it — you can still send the page.'));
      setStage('review');
    } finally {
      setBusy(false);
    }
  }, [busy, t, toast]);

  const discardShot = useCallback(() => {
    if (!shot) return;
    try {
      new FsFile(shot.uri).delete();
    } catch {
      /* already gone */
    }
    setShot(null);
  }, [shot]);

  const named = !!(
    fields.registration?.trim() ||
    fields.vin?.trim() ||
    (fields.manufacturer?.trim() && fields.model?.trim())
  );

  const send = useCallback(async () => {
    if (!named) return;
    setSending(true);
    try {
      const clean: ContractFields = {};
      for (const [k, v] of Object.entries(fields)) {
        if (typeof v === 'string' && v.trim()) (clean as Record<string, string>)[k] = v.trim();
      }
      const files = offline.files; // starts with the engine — there whenever `write.run` queues
      const outcome = await write.run(
        // Saved on the phone with its page; both send themselves. The page copy
        // is deleted once the proposal is accepted or refused.
        async (engine) => {
          const id = uuidv7();
          if (shot) await files!.keep({ id, kind: 'document', mime: shot.mime, uri: shot.uri });
          const { outcome: raised } = await createFromPhone(engine, {
            op: 'proposal.raise',
            id,
            lane: 'proposal:new',
            body: {
              fields: clean,
              ...(verdict?.signals ? { signals: verdict.signals } : {}),
              documentKind: verdict?.kind ?? 'unknown',
              ...(shot ? { pagePending: true } : {}),
            },
          });
          return raised;
        },
        async () => {
          let fileKey: string | undefined;
          /*
            The page goes phone → S3 directly, under a prefix that names the
            organization; the submit refuses a key outside it.

            An upload that fails does NOT stop the proposal. The six fields are what
            a reviewer needs to decide; the page is evidence, and losing it to a
            motorway signal must not cost the member the whole errand.
          */
          if (shot) {
            try {
              const presign = await assetProposalsApi.presign({
                fileName: `document-${Date.now()}.jpg`,
                mimeType: shot.mime,
              });
              await uploadToPresignedUrl(presign.uploadUrl, shot.uri, shot.mime);
              fileKey = presign.fileKey;
            } catch {
              toast.info(t('sendDoc.photoFailed', 'The page did not upload — sending what was read anyway.'));
            }
          }
          return assetProposalsApi.raise({
            fields: clean,
            signals: verdict?.signals,
            documentKind: verdict?.kind ?? 'unknown',
            fileKey,
            fileName: fileKey ? 'document.jpg' : undefined,
            fileMime: fileKey ? shot?.mime : undefined,
          });
        },
      );
      if (outcome.kind === 'refused') {
        toast.error(
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
            outcome.message ||
            t('sendDoc.sendFailed', 'Could not send it'),
        );
        return;
      }
      toast.success(
        outcome.kind === 'queued' ? t('offline.savedForLater') : t('sendDoc.sent', 'Sent — somebody will confirm it.'),
      );
      discardShot();
      router.back();
    } catch (e: unknown) {
      toast.error(caught(e).message || t('sendDoc.sendFailed', 'Could not send it'));
    } finally {
      setSending(false);
    }
  }, [named, shot, fields, verdict, discardShot, t, toast, write, offline.files]);

  return {
    colors,
    t,
    insets,
    cam,
    camera,
    stage,
    setStage,
    busy,
    sending,
    shot,
    verdict,
    fields,
    setFields,
    capture,
    discardShot,
    named,
    send,
  };
}
