import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File as FsFile } from 'expo-file-system';
import { useFormPalette } from '../../components/equipment/equipment-frame';
import { forgetHeldAssets } from '../../hooks/use-held-assets';
import { useEntryDayBounds } from '../../hooks/use-entry-day-bounds';
import { assetEntryDateText, dayKeyOf, occurredAtForDay } from '../../lib/log-dates';
import { useToast } from '../../island/island-context';
import { useImagePicker } from '../../hooks/useImagePicker';
import { scanReceipt } from '../../lib/receipt-scan';
import { assetsApi, assetRegisterApi, uploadToPresignedUrl, type HeldAsset } from '../../lib/api';
import {
  normalizeKindShape,
  findLogType,
  validateLogValues,
  moneyToCents,
  COST_LOG_KEY,
  type LogValueProblem,
  fromCents,
} from '@hbcfield/shared/client';
import { COLORS } from '../../lib/constants';
import { logTypeLabel } from '../../lib/log-display';
import { useOffline } from '../../offline/offline-context';
import { logFromPhone } from '../../offline/assets/log-actions';
import { caught } from '../../lib/caught';

/**
 * "What did you do?" — one log entry against something I hold.
 *
 * The form is DRAWN FROM THE KIND: whatever fields the log type declares, in its
 * order, and nothing else. There is no Fuel screen and no Damage screen in this
 * app, which is what lets a customer add "Tyres" to their vans on Monday and a
 * driver file one that afternoon without an app release.
 *
 * ⚠️ The answers are checked HERE with the same `validateLogValues` the server
 * runs, so a missing odometer is said beside the box rather than after a round
 * trip on one bar of signal — and the server refuses exactly the same answers
 * for exactly the same reasons if a phone ever skips this.
 *
 * ⚠️ The Cost log is not drawn here. It is the existing "Add a receipt" flow,
 * with its camera and its PDF reader, and a second way to file a cost would be
 * a second set of rules to keep in step.
 */

export type Draft = Record<string, string>;

/** Today as a LOCAL day — `toISOString()` answers yesterday's date after midnight east of Greenwich. */
export const today = () => dayKeyOf(new Date());

/** AssetLogScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useAssetLogScreen() {
  const { colors, COLORS } = useFormPalette();
  const { t } = useTranslation();
  const tt = t as unknown as (k: string, d: string, o?: Record<string, unknown>) => string;
  const toast = useToast();
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  const { takePhoto, pickFromGallery } = useImagePicker();
  const params = useLocalSearchParams<{ assetId?: string; logType?: string; from?: string }>();
  const assetId = typeof params.assetId === 'string' ? params.assetId : '';
  const logKey = typeof params.logType === 'string' ? params.logType : '';
  /*
    Opened from the workspace's register (Manage → Equipment) by somebody who
    holds `canLogAssets` there — not from what they hold. The record is then
    read by id, which the server answers only inside their workspaces (404
    otherwise), and the entry is authorised by the permission, not custody.
  */
  const fromRegister = params.from === 'register';

  const [held, setHeld] = useState<HeldAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>({});
  const [when, setWhen] = useState(today());
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);
  const [problems, setProblems] = useState<LogValueProblem[]>([]);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);

  const shape = useMemo(() => normalizeKindShape(held?.asset?.category?.config), [held]);
  const type = useMemo(() => (held ? findLogType(shape, logKey) : null), [held, shape, logKey]);
  const moneyField = type?.fields.find((f) => f.type === 'money') ?? null;
  /* The days the calendar offers, by the rule the server refuses by. */
  const { canManageAssets, bounds } = useEntryDayBounds();
  const photoField = type?.fields.find((f) => f.type === 'photo') ?? null;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (fromRegister) {
          const asset = await assetRegisterApi.get(assetId);
          if (alive)
            setHeld({
              id: asset.id,
              assetId: asset.id,
              startedAt: '',
              endedAt: null,
              asset: asset as HeldAsset['asset'],
              totals: { inCents: 0, outCents: 0, netCents: 0, entries: 0 },
            });
          return;
        }
        const { periods } = await assetsApi.mine();
        // From what I HOLD, never fetched by id: this screen must not be a way
        // to look up an asset somebody was not given (the register's door is
        // `from=register`, read under the workspace permission instead).
        if (alive) setHeld(periods.find((h) => h.assetId === assetId) ?? null);
      } catch (e: unknown) {
        if (alive) toast.error(caught(e).message || tt('logbook.loadFailed', 'Could not open that'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, fromRegister]);

  // A cost is the receipt flow. Replace rather than push, so "back" leaves both.
  useEffect(() => {
    if (!loading && logKey === COST_LOG_KEY) router.replace({ pathname: '/(app)/asset-expense', params: { assetId } });
  }, [loading, logKey, assetId]);

  const set = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setProblems((p) => p.filter((x) => x.key !== key));
  };

  const forgetPhoto = useCallback((uri?: string) => {
    if (!uri) return;
    try { new FsFile(uri).delete(); } catch { /* already gone */ }
  }, []);

  /** The answers as the server takes them: money in cents, a photo never inside. */
  const values = useMemo(() => {
    const out: Record<string, string | number> = {};
    for (const f of type?.fields ?? []) {
      const raw = (draft[f.key] ?? '').trim();
      if (!raw || f.type === 'photo') continue;
      if (f.type === 'money') {
        const cents = moneyToCents(raw);
        out[f.key] = cents ?? raw;
      } else out[f.key] = raw;
    }
    return out;
  }, [draft, type]);

  /**
   * Read the amount and the date off a slip, on the phone — the same reader and
   * the same rules as "Add a receipt". The picture then becomes the entry's
   * photo when the type takes one; otherwise it is deleted at once, having done
   * its only job.
   */
  const readReceipt = useCallback(async () => {
    if (!moneyField || reading) return;
    const shot = await takePhoto('receipt');
    if (!shot) return;
    setReading(true);
    try {
      const { receipt } = await scanReceipt(shot.uri);
      if (receipt.totalCents) set(moneyField.key, fromCents(receipt.totalCents.value).toFixed(2));
      else toast.info(tt('expenses.noTotal', 'Could not find a total — type it in.'));
      if (receipt.date) setWhen(receipt.date.value);
    } catch {
      toast.error(tt('expenses.readFailed', 'Could not read it — check the amount yourself.'));
    } finally {
      setReading(false);
    }
    if (photoField && !photo) setPhoto({ uri: shot.uri, mime: shot.mimeType || 'image/jpeg' });
    else forgetPhoto(shot.uri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneyField, photoField, photo, reading, takePhoto, forgetPhoto]);

  const addPhoto = useCallback(async (from: 'camera' | 'library') => {
    const purpose = moneyField ? 'receipt' : 'issue-photo';
    const picked = from === 'camera' ? await takePhoto(purpose) : (await pickFromGallery('issue-photo'))[0] ?? null;
    if (!picked) return;
    if (photo) forgetPhoto(photo.uri);
    setPhoto({ uri: picked.uri, mime: picked.mimeType || 'image/jpeg' });
    if (photoField) setProblems((p) => p.filter((x) => x.key !== photoField.key));
  }, [moneyField, photoField, photo, takePhoto, pickFromGallery, forgetPhoto]);

  const send = useCallback(async () => {
    if (!type) return;
    /*
      The calendar cannot offer a day outside the window, but a date read off a
      receipt is set without asking it — an old slip photographed today would
      otherwise travel all the way to the server to be told so.
    */
    const now = new Date();
    const dateProblem = assetEntryDateText(tt, when, { canManageAssets, now });
    const occurredAt = occurredAtForDay(when, now);
    if (dateProblem || !occurredAt) {
      toast.error(dateProblem ?? tt('logbook.badDate', 'That date could not be read'));
      return;
    }
    const checked = validateLogValues(type, values, { hasPhoto: !!photo, shape });
    if (!checked.ok) {
      setProblems(checked.problems);
      return;
    }
    setSending(true);
    try {
      if (offline.engine && offline.files) {
        // Saved on the phone with its photo; both send themselves.
        const outcome = await logFromPhone(offline.engine, offline.files, {
          assetId, logType: type.key, values, note: note.trim() || undefined,
          occurredAt: occurredAt.toISOString(), photo,
        });
        if (outcome.kind === 'refused') {
          toast.error(
            (outcome.code && tt(`offline.errors.${outcome.code}`, '')) ||
              outcome.message ||
              tt('logbook.sendFailed', 'Could not send it'),
          );
          return;
        }
        toast.success(
          outcome.kind === 'queued'
            ? tt('offline.savedForLater', 'Saved — it will send itself')
            : tt('logbook.sent', 'Logged'),
        );
        if (photo) forgetPhoto(photo.uri);
        forgetHeldAssets(); // the profile's count and list read this again
        router.back();
        return;
      }
      /*
        A build without the offline layer. The photo goes phone → S3 directly
        under this asset's prefix; a failed upload does NOT cost the entry — the
        odometer and the date are what the logbook needs, the picture is evidence.
      */
      let receiptKey: string | undefined;
      if (photo) {
        try {
          const presign = await assetsApi.presignLog(assetId, {
            logType: type.key, fileName: `photo-${Date.now()}.jpg`, mimeType: photo.mime, occurredAt: occurredAt.toISOString(),
          });
          await uploadToPresignedUrl(presign.uploadUrl, photo.uri, photo.mime);
          receiptKey = presign.fileKey;
        } catch {
          toast.info(tt('logbook.photoFailed', 'The photo did not upload — sending the entry anyway.'));
        }
      }
      await assetsApi.createLog(assetId, {
        logType: type.key, values, note: note.trim() || undefined, occurredAt: occurredAt.toISOString(),
        receiptKey, receiptName: receiptKey ? 'photo.jpg' : undefined, receiptMime: receiptKey ? photo?.mime : undefined,
      });
      toast.success(tt('logbook.sent', 'Logged'));
      if (photo) forgetPhoto(photo.uri);
      forgetHeldAssets(); // the profile's count and list read this again
      router.back();
    } catch (e: unknown) {
      toast.error(caught(e).message || tt('logbook.sendFailed', 'Could not send it'));
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, values, photo, shape, when, note, assetId, canManageAssets, offline.engine, offline.files, forgetPhoto]);

  const title = type ? logTypeLabel(type, tt) : tt('logbook.title', 'What did you do?');

  return {
    colors,
    COLORS,
    t,
    tt,
    insets,
    logKey,
    held,
    loading,
    draft,
    when,
    setWhen,
    note,
    setNote,
    photo,
    setPhoto,
    problems,
    reading,
    sending,
    type,
    moneyField,
    bounds,
    set,
    forgetPhoto,
    readReceipt,
    addPhoto,
    send,
    title,
  };
}
