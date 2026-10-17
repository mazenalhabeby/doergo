import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenHeader } from '../../src/components';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/island/island-context';
import { MediaAccessScreen } from '../../src/permissions/media-access-screen';
import { useCameraAccess } from '../../src/permissions/use-media-access';
import { useAuth } from '../../src/contexts/auth-context';
import { holds } from '../../src/lib/permissions';
import { SPACING, FONT_SIZE } from '../../src/lib/constants';
import { useCardCapture } from '../../src/components/scan-card/use-card-capture';
import { useCardReview } from '../../src/components/scan-card/use-card-review';
import { useCardSaveFlow } from '../../src/components/scan-card/use-card-save-flow';
import { CardReviewScreen } from '../../src/components/scan-card/card-review-screen';
import { CardCamera } from '../../src/components/scan-card/card-camera';
import { NotAllowed } from '../../src/components/not-allowed';

/**
 * Scan a business card into a client.
 *
 * Two states in one screen: the camera, then what was read. They are not
 * separate routes because the second is a review of the first — going "back"
 * from the review must return to the camera, not to the client list.
 *
 * ⚠️ Nothing saves without the person seeing it. Fields the reader can PROVE
 * (email, phone, website, VAT) are shown quietly; fields it INFERS (name,
 * company, address, title) and fields it found nothing for are grouped under
 * one heading and coloured, so the two guesses worth checking are not buried
 * among six certainties. Every line the card gave stays one tap away on any
 * row, so a wrong guess is a correction rather than a re-scan.
 *
 * ⚠️ THE SCREEN ASKS ONE QUESTION AND SAVES EVERYTHING IT READ. The version
 * this replaces asked five identical ones — five bordered cards, three of them
 * empty and full height, each with its own orange badge and its own "Pick a
 * different line" — while quietly binning `website`, `vat`, `address` and
 * `title`, because `FieldKey` was `name | company | email | phone`. A website
 * therefore turned up in the CONTACT PERSON box, which is the reader working
 * correctly and the screen having nowhere to put the answer.
 *
 * ⚠️ Which fields are offered is decided by `cardFieldsFor`, and anything read
 * that the chosen destination has no column for is NAMED on screen rather than
 * dropped. That rule, the kind guess and its reason all live in
 * `card-review.ts` so they can be argued with and tested without a camera.
 *
 * ⚠️ THE CARD IS LOOKED AT MORE THAN ONCE, and the screen says so when the look
 * was bad. Three things follow from that and none of them is cosmetic: the
 * capture loop below takes two or three frames and merges them; a poor read
 * leads with a warning instead of presenting four confident fields from a
 * photograph that half failed; and what the reader understood but no field
 * wanted is kept as an editable extra rather than dropped in silence.
 */
/*
  The pieces live in `src/components/scan-card/`: the camera and its looks
  (`use-card-capture.ts`, `card-camera.tsx`), what was read and every
  correction to it (`use-card-review.ts`), the duplicate check and the save
  (`use-card-save-flow.ts`), and the review itself (`card-review-screen.tsx`).
  This route decides only whether the scanner may open, and which state shows.
*/

export default function ScanCardScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  /*
    ⚠️ The FUNCTION, not the context object. `ToastProvider` builds a fresh
    `value` object every render, so `toast` has a new identity every time —
    while `toast.error` is a `useCallback` and is stable. `pickLine` is handed
    to memoised rows, and closing over `toast` would re-make it on every render
    and turn every row's memo into decoration.
  */
  const toastError = toast.error;
  const cam = useCameraAccess();
  const { user } = useAuth();

  /*
    Which workspace the client should be filed in, carried from the add sheet.

    Absent is a real answer — the sheet was open on "All workspaces", or this
    route was reached by deep link — and means the same thing it means on the
    form: no workspace. Expo Router hands params back as `string | string[]`,
    so the array form is folded here rather than at the call site.
  */
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const spaceId = Array.isArray(params.spaceId) ? params.spaceId[0] : params.spaceId;

  /*
    A route is reachable by deep link whether or not a button points at it.

    The server refuses the save regardless, so nothing can be created without
    the permission — but letting somebody photograph a card, correct five
    fields and only then be refused is a waste of their time and an odd place
    to learn what they are not allowed to do.
  */
  const canAdd = holds(user, 'crmCreateClients') || holds(user, 'crmManageClients');

  const review = useCardReview({ t, toastError });
  const capture = useCardCapture({ t, toastError, onRead: review.applyRead });
  const flow = useCardSaveFlow({
    t,
    toast,
    read: review.read,
    kind: review.kind,
    destination: review.destination,
    company: review.company,
    spaceId,
    chooseDestination: review.chooseDestination,
  });

  // ── Allowed to add a client at all? ───────────────────────────────────────
  if (!canAdd) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
        <ScreenHeader title={t('scan.title', 'Scan a card')} />
        <NotAllowed message={t('scan.notAllowed', 'You do not have permission to add clients.')} />
      </SafeAreaView>
    );
  }

  // ── Camera permission ─────────────────────────────────────────────────────
  if (!cam.granted) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
        <ScreenHeader title={t('scan.title', 'Scan a card')} />
        {/*
          ⚠️ This used to pass `canAskAgain={permission?.canAskAgain !== false}`,
          which reads TRUE while the first check is still in flight — so a phone
          where the system had stopped asking was offered a button that did
          nothing. `useCameraAccess` names the unresolved state instead, and
          re-reads the permission on every focus so returning from Settings is
          noticed without restarting the app.
        */}
        <MediaAccessScreen
          purpose="business-card"
          access={cam}
          onCancel={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  // ── Review what was read ──────────────────────────────────────────────────
  if (review.read) {
    return <CardReviewScreen review={{ ...review, read: review.read }} flow={flow} />;
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  return (
    <CardCamera
      camera={capture.camera}
      setBox={capture.setBox}
      frame={capture.frame}
      busy={capture.busy}
      progress={capture.progress}
      capture={capture.capture}
    />
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  hint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },
});
