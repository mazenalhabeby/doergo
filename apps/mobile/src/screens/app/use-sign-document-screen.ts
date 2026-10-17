import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { documentsApi, type DocumentChain } from '../../lib/api';
import { httpsUrl, openSafeUrl } from '../../lib/safe-links';

/*
  Signing, on a phone.

  THREE STEPS, NAMED AND COUNTED. Signing products that show "step 2 of 3"
  complete measurably more often than ones that do not, and more than half of
  business signatures now happen on a handheld — so the shape of this screen is
  the shape that matters most.

    1  Read      — the document, opened in a real viewer
    2  Agree     — consent, recorded as its own act
    3  Sign      — the drawing, then the seal

  Consent is separate from the drawing on purpose. eIDAS treats agreement to
  the electronic form as a distinct thing from the signature, and a trail that
  merged them could not show the signer was told what they were doing first.

  The idempotency key is generated ONCE, when the screen mounts, and reused on
  every retry. A van loses signal mid-request; the retry must return the seal
  that already exists rather than sign a second time.
*/

export type Step = 'read' | 'agree' | 'sign' | 'done';

/** SignDocumentScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useSignDocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();
  /*
    ⚠️ ONLY THE ID IS READ FROM THE ROUTE. `title` and `mode` used to come from
    the URL too — so a hbcfield:// link could put any words above the consent
    and signature ("Overtime approval" over a contract), or turn a signature
    into a bare acknowledgement on screen. Both are now resolved from the server
    for this document id; the URL can only say WHICH document.
  */
  const params = useLocalSearchParams<{ id: string }>();

  const [step, setStep] = useState<Step>('read');
  const [opening, setOpening] = useState(false);
  const [hasRead, setHasRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  /*
    Who has signed this already.

    A manager countersigning a time sheet is agreeing with the worker's
    signature, and being asked to do that without seeing it is being asked to
    rubber-stamp — which is the thing a chain exists to prevent.

    Silent when there is no chain: most documents have one signer, and an empty
    panel on every payslip would be noise.
  */
  const [chain, setChain] = useState<DocumentChain | null>(null);
  // The document's own title, as the server has it (the chain answers for every signer).
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    documentsApi
      .chain(String(params.id))
      .then((c) => {
        if (cancelled) return;
        if (typeof c?.title === 'string' && c.title) setTitle(c.title);
        if (c?.steps?.length > 1) setChain(c);
      })
      // Best effort: the panel is context, not a precondition for signing.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  /*
    Made once, deliberately, and never regenerated.

    A key that changed on retry would defeat its own purpose — the server would
    see a new attempt and sign again. `useMemo` with an empty dependency list is
    what pins it to the life of this screen.
  */
  const idempotencyKey = useMemo(
    () => `sign-${params.id}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /*
    The signing mode, always from the server — the same list + types the
    documents screen reads. A document routed to somebody else for a
    countersignature is not in their own list; that is an in-app signature
    (the server refuses anything else on the step), so IN_APP stands.
  */
  const [mode, setMode] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    Promise.all([documentsApi.list(), documentsApi.listTypes()])
      .then(([docs, types]) => {
        const doc = docs.find((d) => d.id === String(params.id));
        const type = doc ? types.find((ty) => ty.id === doc.typeId) : undefined;
        if (!cancelled) setMode(type?.signatureMode ?? 'IN_APP');
      })
      .catch(() => {
        if (!cancelled) setMode('IN_APP');
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);
  const isAcknowledge = mode === 'ACKNOWLEDGE';

  const openDocument = useCallback(async () => {
    setOpening(true);
    try {
      const res = await documentsApi.downloadUrl(String(params.id));
      if (!res?.url) throw new Error(t('documents.openFailed'));
      // A signed link from our server — https only, never another scheme.
      if (!(await openSafeUrl(httpsUrl(res.url)))) throw new Error(t('documents.openFailed'));
      // Opening is what "read" means here. The app cannot know they read it —
      // but it can record that it was opened, which is what the trail claims.
      setHasRead(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('documents.openFailed'));
    } finally {
      setOpening(false);
    }
  }, [params.id, t, toast]);

  const agree = useCallback(async () => {
    // Not before the server has said how this document is signed.
    if (!mode) return;
    setBusy(true);
    try {
      await documentsApi.consent(String(params.id));
      setStep(isAcknowledge ? 'done' : 'sign');
      if (isAcknowledge) {
        await documentsApi.acknowledge(String(params.id));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('documents.sign.failed'));
    } finally {
      setBusy(false);
    }
  }, [params.id, mode, isAcknowledge, t, toast]);

  const submit = useCallback(
    async (signatureImage: string) => {
      setBusy(true);
      try {
        const res = await documentsApi.sign(String(params.id), { signatureImage, idempotencyKey });
        // Kept so the confirmation can show the mark they actually made.
        setSignature(signatureImage);
        setStep('done');
        if (res?.alreadySigned) {
          // Not an error. A retry found the seal that already existed, which is
          // exactly what the key is for — say so plainly rather than alarm anyone.
          toast.success(t('documents.sign.alreadySigned'));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('documents.sign.failed'));
      } finally {
        setBusy(false);
      }
    },
    [params.id, idempotencyKey, t, toast],
  );

  const stepNumber = step === 'read' ? 1 : step === 'agree' ? 2 : 3;
  const totalSteps = isAcknowledge ? 2 : 3;

  return {
    router,
    insets,
    colors,
    t,
    step,
    setStep,
    opening,
    hasRead,
    busy,
    signature,
    chain,
    title,
    isAcknowledge,
    openDocument,
    agree,
    submit,
    stepNumber,
    totalSteps,
  };
}

/** What SignDocumentScreen and its sections read. */
export type SignDocumentScreenState = ReturnType<typeof useSignDocumentScreen>;
