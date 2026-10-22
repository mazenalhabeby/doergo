import { useEffect, useMemo, useState } from 'react';
import { Text, ActivityIndicator, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useImagePicker } from '@/hooks/use-image-picker';
import { type DocumentType } from '@/lib/api/documents';
import { typeGroups, type AskDocument, type AskRequirement } from '@/lib/document-asks';
import { useSyncStatus } from '@/offline/offline-context';
import { STILL_MINE } from '@/offline/actions/outcome';
import { BlurSheet } from '@/components/blur-sheet';
import { SheetPanel } from '@/components/sheet-panel';
import { PressableScale } from '@/components/pressable-scale';
import { DocumentScanner } from '@/components/document-scanner';
import { s, useSupplyPalette } from './styles';
import { useCredentialPhoto } from './use-credential-photo';
import { usePaperPages } from './use-paper-pages';
import { OfficeRow, TypeChooser } from './type-chooser';
import { CredentialSection } from './credential-section';
import { PagesSection } from './pages-section';

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
export function SupplyDocumentSheet({
  types,
  visible,
  onClose,
  onSubmitted,
  initialTypeId,
  onContract,
  requirements,
  documents,
}: {
  types: DocumentType[];
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  /** Opened FOR one requirement (the home action strip) — that type, already chosen. */
  initialTypeId?: string | null;
  /**
   * "Contract for a vehicle or equipment" — the one thing a member hands in
   * that is not a document of THEIRS. Present only where the organization runs
   * Assets; choosing it leaves this sheet for the contract camera, which reads
   * the page on the phone and raises a proposal for the office.
   *
   * It lives here because it used to be a second door ("Send a document" on the
   * profile) to the same question — what are you handing in?
   */
  onContract?: () => void;
  /**
   * What is asked of the member, and what they already have — so "What is it?"
   * lists what is needed first, shows what is being checked without offering
   * it again, and leaves out what was approved. Absent (the home strip, which
   * opens the sheet FOR one type), every type is simply offered.
   */
  requirements?: readonly AskRequirement[];
  documents?: readonly AskDocument[];
}) {
  const { amazen, a, colors, COLORS } = useSupplyPalette();
  const { t } = useTranslation();
  const { operations } = useSyncStatus();
  const { pickFromGallery } = useImagePicker();

  const officeRow = onContract ? <OfficeRow onContract={onContract} /> : null;

  const suppliable = useMemo(
    () => types.filter((ty) => ty.direction !== 'ISSUED' && ty.isActive),
    [types],
  );

  const [typeId, setTypeId] = useState<string>('');
  useEffect(() => {
    if (visible && initialTypeId) setTypeId(initialTypeId);
  }, [visible, initialTypeId]);
  const [busy, setBusy] = useState(false);

  /*
    "What is it?", sorted by what is asked of the member — `document-asks`, the
    same rule as the Still needed card. Being checked is shown and not offered;
    approved and valid is left out.
  */
  const queuedTypeIds = useMemo(() => new Set(
    operations
      .filter((o) => o.op === 'document.supply' && STILL_MINE.has(o.state))
      .map((o) => String((o.payload.body as { typeId?: string } | undefined)?.typeId ?? '')),
  ), [operations]);
  const groups = useMemo(
    () => typeGroups(suppliable, requirements ?? [], documents ?? [], queuedTypeIds),
    [suppliable, requirements, documents, queuedTypeIds],
  );
  const selectable = useMemo(
    () => [...groups.asked.map((r) => r.type), ...groups.other] as DocumentType[],
    [groups],
  );
  const type = selectable.find((ty) => ty.id === typeId) ?? selectable[0];

  /* A credential: one photo, read and filed (`use-credential-photo`). */
  const cred = useCredentialPhoto({ type, setBusy, pickFromGallery });
  /* Sheets of paper, for a type that is paper rather than a card (`use-paper-pages`). */
  const paper = usePaperPages({ type, busy, setBusy, pickFromGallery });

  const reset = () => {
    cred.clearPhoto();
    paper.clearAll();
    setBusy(false);
  };

  /* A photo belongs to the type it was taken for — changing the type starts again. */
  const chooseType = (id: string) => {
    if (id === type?.id) return;
    cred.clearPhoto();
    paper.clearPages();
    setTypeId(id);
  };

  /* Closing is not keeping: an abandoned passport photo must not be there next time. */
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  /* Filed (or queued): start clean and hand back to the screen. */
  const finish = () => {
    reset();
    onSubmitted();
    onClose();
  };
  const submit = async () => { if (await cred.submit()) finish(); };
  const submitPages = async () => { if (await paper.submitPages()) finish(); };

  const multi = !!type?.multiPage;

  return (
    <BlurSheet visible={visible} onClose={close}>
      {/*
        The shared surface. Passing a bare ScrollView to BlurSheet left the
        content floating over the blurred page with no panel behind it — the
        screen it had covered showed through the text.
      */}
      <SheetPanel
        title={t('documents.supply.title')}
        onClose={close}
        closeDisabled={busy}
        maxHeightFraction={0.9}
        style={{ backgroundColor: a.well, borderTopLeftRadius: amazen.radius.sheet, borderTopRightRadius: amazen.radius.sheet }}
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

        {selectable.length === 0 && groups.checking.length === 0 ? (
          officeRow ?? (
            <Text style={[s.empty, { color: colors.textSecondary }]}>
              {t('documents.supply.nothingToSupply')}
            </Text>
          )
        ) : (
          <>
            <TypeChooser groups={groups} selectedId={type?.id} onChoose={chooseType} />

            {officeRow}

            {/*
              Sheets of paper take a different path entirely.

              No scanner, no frame, no expiry: those exist to photograph a card
              accurately and are noise on a hotel invoice. The type decides,
              which is why this branches here rather than on what the file is.
            */}
            {multi ? <PagesSection paper={paper} busy={busy} /> : <CredentialSection cred={cred} />}
          </>
        )}
        </ScrollView>

        {/*
          Pinned under the scroll area, not inside it.

          The one control the sheet exists for should not require scrolling to
          reach — on a short phone the form is taller than the sheet, and an
          action that scrolls out of view reads as an action that is missing.
        */}
        {!!type && (
          <PressableScale
            onPress={multi ? submitPages : submit}
            /*
              ⚠️ A missing date does NOT block sending HERE, and that is a
              deliberate difference from the web — see `dateNotFound`, which
              says "send it anyway, the office will confirm it". Typing a date
              is hardest on the surface somebody is holding in a yard, and the
              document is on its way to a person who can read it. What DOES
              block is a read still in flight: sending then races the staged
              upload and sends the same photo twice.
            */
            disabled={multi ? paper.pages.length === 0 || busy : !cred.photo || busy || cred.reading}
            /*
              A dimmed version of the live colour is the worst disabled state
              there is: it still reads as the button, just badly rendered, so
              people tap it and conclude the app is broken. Off means a
              different surface entirely.
            */
            style={[
              s.submit,
              (multi ? paper.pages.length === 0 || busy : !cred.photo || busy || cred.reading)
                ? { backgroundColor: colors.surfaceRaised }
                : [s.submitOn, { backgroundColor: COLORS.primary, shadowColor: COLORS.primary }],
            ]}
          >
            {busy
              ? <ActivityIndicator color={colors.textMuted} />
              : (
                <Text
                  style={[
                    s.submitText,
                    { color: (multi ? paper.pages.length > 0 : !!cred.photo && !cred.reading) ? COLORS.white : colors.textMuted },
                  ]}
                >
                  {t('documents.supply.send')}
                </Text>
              )}
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
      {/*
        The scanner, opened for a SHEET.

        Its own instance rather than a flag on the credential one: that path
        reads a machine-readable zone, fills in an expiry and stages a single
        photo, none of which applies to page four of a hotel invoice. Same
        component, PAGE frame, and the result becomes one more page.
      */}
      <DocumentScanner
        visible={paper.scanningPage}
        title={type?.label ?? t('documents.supply.title')}
        twoSided={false}
        shape="PAGE"
        onCancel={() => paper.setScanningPage(false)}
        onDone={(result) => {
          paper.setScanningPage(false);
          if (result?.uri) paper.addPages([{ uri: result.uri }]);
        }}
      />

      <DocumentScanner
        visible={cred.scanning}
        title={type?.label ?? t('documents.supply.title')}
        twoSided={!!type?.twoSided}
        shape={type?.scanShape ?? 'CARD'}
        onCancel={() => cred.setScanning(false)}
        onDone={cred.onScanned}
      />
    </BlurSheet>
  );
}
