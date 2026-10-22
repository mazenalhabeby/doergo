import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_PAGES } from '@hbcfield/shared/client';
import { useToast } from '../../island/island-context';
import { newPageId, readyKeys, allStaged, pendingCount, failedCount, type Page } from '../../lib/page-order';
import { documentPicker } from '../../lib/optional-native';
import { stagePage } from '../../lib/page-upload';
import { documentsApi, type DocumentType } from '../../lib/api/documents';
import { useConnectivity } from '../../offline/offline-context';
import type { PickFromGallery } from './supply-helpers';

/**
 * Sheets of paper, for a type that is paper rather than a card.
 *
 * Held beside the single-photo state rather than replacing it: the two flows
 * share the sheet, the type decides which is shown, and a member who changes
 * the type mid-way should not carry pages into a scanner.
 */
export function usePaperPages({
  type,
  busy,
  setBusy,
  pickFromGallery,
}: {
  type: DocumentType | undefined;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  pickFromGallery: PickFromGallery;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const connectivity = useConnectivity();

  const [pages, setPages] = useState<Page[]>([]);
  const [pageTitle, setPageTitle] = useState('');
  /** The scanner, opened for a SHEET rather than a card. */
  const [scanningPage, setScanningPage] = useState(false);

  /**
   * Take one sheet and start sending it immediately.
   *
   * ⚠️ The upload is NOT awaited here. Somebody photographing six pages spends
   * fifteen seconds doing it; those fifteen seconds are free upload time, and
   * spending them idle means the member waits all over again on Send. The tile
   * shows the sheet's own state while it goes.
   */
  /*
    ⚠️ Refused offline rather than queued. Each sheet is PUT to the object store
    as it is taken, and a queued submit naming keys whose uploads never happened
    would fail on arrival having told the member it was sent. A flow that cannot
    work without a connection should say so, once, up front.
  */
  const canAddPage = () => {
    if (connectivity !== 'online') {
      toast.info(t('documents.pages.needsConnection'));
      return false;
    }
    if (pages.length >= MAX_PAGES) {
      toast.info(t('documents.pages.tooMany', { count: MAX_PAGES }));
      return false;
    }
    return true;
  };

  /**
   * Add sheets and start sending them immediately.
   *
   * ⚠️ The uploads are NOT awaited. Somebody adding six pages spends the time
   * doing it; those seconds are free upload time, and spending them idle means
   * waiting all over again on Send. Each tile shows its own state while it goes.
   */
  const addPages = (incoming: { uri: string; mimeType?: string; name?: string }[]) => {
    if (!type || incoming.length === 0) return;
    const fresh: Page[] = incoming
      .slice(0, MAX_PAGES - pages.length)
      .map((f) => ({
        id: newPageId(),
        uri: f.uri,
        mimeType: f.mimeType,
        name: f.name,
        state: 'compressing' as const,
      }));
    setPages((prev) => [...prev, ...fresh]);
    for (const page of fresh) {
      void stagePage(page, type.id, (next) =>
        setPages((prev) => prev.map((p) => (p.id === next.id ? next : p))),
      );
    }
  };

  /** One sheet, through the scanner — framed on A4, deskewed and cropped. */
  const scanPage = () => {
    if (!type || !canAddPage()) return;
    setScanningPage(true);
  };

  /*
    Several at once, out of the photo library.

    Paper does not always start as paper: a hotel invoice arrives by email and
    is already in Photos. Multi-select means six sheets in one tap instead of
    six trips through a camera that was never needed.
  */
  /*
    A PDF, straight off the phone.

    Most of what this feature exists for never was paper: an invoice, a booking,
    a flight confirmation arrives by email as a PDF. Photographing a screen
    showing it is what members did instead, and the result was unreadable.
  */
  const pickFile = async () => {
    if (!type || !canAddPage()) return;
    const picker = documentPicker();
    if (!picker) {
      toast.info(t('documents.pages.noFilePicker'));
      return;
    }
    const picked = await picker.getDocumentAsync({
      /*
        Named explicitly rather than `image/*`. The server files PDF, PNG and
        JPEG and nothing else, so a wildcard lets somebody pick a HEIC off an
        iPhone, watch it upload, and only then be refused. (It also contains
        the characters that open a comment, which the DOM-globals guard's
        stripper takes literally.)
      */
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (picked.canceled || !picked.assets?.length) return;
    addPages(
      picked.assets.map((f) => ({
        uri: f.uri,
        mimeType:
          f.mimeType ??
          (f.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        name: f.name ?? undefined,
      })),
    );
  };

  const pickPages = async () => {
    if (!type || !canAddPage()) return;
    const picked = await pickFromGallery('document', MAX_PAGES - pages.length);
    addPages(picked.filter((p) => p.uri).map((p) => ({ uri: p.uri })));
  };

  /** A sheet that did not land, sent again — its local file was kept for this. */
  const retryPage = (id: string) => {
    if (!type) return;
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    void stagePage({ ...page, state: 'compressing' }, type.id, (next) =>
      setPages((prev) => prev.map((p) => (p.id === next.id ? next : p))),
    );
  };

  /**
   * File the sheets as one document. True once filed — the sheet then resets
   * and closes.
   *
   * Kept apart from the credential `submit` on purpose — that one is about a
   * credential: a scanned card, a read expiry, a verification queue. None of it
   * applies here, and threading `if (multiPage)` through it would make both
   * harder to read.
   */
  const submitPages = async (): Promise<boolean> => {
    if (!type || pages.length === 0 || busy) return false;
    if (!pageTitle.trim()) {
      toast.error(t('documents.pages.needTitle'));
      return false;
    }
    if (!allStaged(pages)) {
      const waiting = pendingCount(pages);
      toast.info(
        waiting > 0
          ? t('documents.pages.waiting', { count: waiting })
          : t('documents.pages.failed', { count: failedCount(pages) }),
      );
      return false;
    }

    setBusy(true);
    try {
      const keys = readyKeys(pages);
      await documentsApi.submitOwn({
        // The first sheet is the document; the rest are its further pages.
        stagingKey: keys[0],
        pageStagingKeys: keys.slice(1),
        typeId: type.id,
        title: pageTitle.trim(),
      });
      toast.success(t('documents.supply.submitted'));
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Pages belong to the type they were taken for. */
  const clearPages = () => setPages([]);
  const clearAll = () => {
    setPages([]);
    setPageTitle('');
  };

  return {
    pages, setPages, pageTitle, setPageTitle, scanningPage, setScanningPage,
    addPages, scanPage, pickFile, pickPages, retryPage, submitPages, clearPages, clearAll,
  };
}

export type PaperPages = ReturnType<typeof usePaperPages>;
