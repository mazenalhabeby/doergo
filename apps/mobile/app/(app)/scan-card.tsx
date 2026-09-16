import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView,
  useWindowDimensions, type KeyboardTypeOptions,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenHeader } from '../../src/components';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { scanBusinessCard, type ParsedCard } from '../../src/lib/card-scan';
import { frameToImageCrop } from '@hbcfield/shared/client';
import { MediaAccessScreen } from '../../src/permissions/media-access-screen';
import { useCameraAccess } from '../../src/permissions/use-media-access';
import type { MobileCustomer } from '../../src/lib/api';
import { File as FsFile } from 'expo-file-system';
import { useAuth } from '../../src/contexts/auth-context';
import { holds } from '../../src/lib/permissions';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import { ChoiceChip } from '../../src/components/customer/client-fields';
import { CardFieldRow, CardFieldGroup } from '../../src/components/customer/card-field-row';
import { CardDestinationPicker } from '../../src/components/customer/card-destination';
import { DuplicateSheet, useDuplicateCheck } from '../../src/components/customer/card-duplicate';
import { useSaveScannedCard } from '../../src/components/customer/card-save';
import {
  CARD_FIELDS, cardCertainty, cardClientNames, cardFieldsFor, cardValues, fieldNeedsLook,
  guessCardKind, homelessFields,
  type CardCertainty, type CardDestination, type CardFieldKey, type CardKind, type CardValues,
} from '../../src/components/customer/card-review';

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
 */

/**
 * The label and the keyboard for each field.
 *
 * `name` is the one that moves: on a company's card it is the CONTACT PERSON,
 * on a person's card it is the client. Everything else means the same thing
 * whichever way the card is read.
 */
const FIELD_LABEL: Record<CardFieldKey, string> = {
  company: 'scan.fCompany',
  name: 'customers.fName',
  title: 'scan.jobTitle',
  email: 'customers.fEmail',
  phone: 'customers.fPhone',
  website: 'customers.form.website',
  address: 'scan.fAddress',
  vat: 'customers.form.vatId',
};

const FIELD_INPUT: Partial<Record<CardFieldKey, { keyboardType?: KeyboardTypeOptions; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters' }>> = {
  company: { autoCapitalize: 'words' },
  name: { autoCapitalize: 'words' },
  email: { keyboardType: 'email-address', autoCapitalize: 'none' },
  phone: { keyboardType: 'phone-pad' },
  website: { keyboardType: 'url', autoCapitalize: 'none' },
  // A VAT number is printed in capitals and read back in capitals: "atu123" is
  // the same number and the wrong thing to have on a record.
  vat: { autoCapitalize: 'characters' },
};

const EMPTY_VALUES: CardValues = {
  company: '', name: '', title: '', email: '', phone: '', website: '', address: '', vat: '',
};

export default function ScanCardScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const { save: commitCard } = useSaveScannedCard();
  const duplicate = useDuplicateCheck();
  const cam = useCameraAccess();
  const { user } = useAuth();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();

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
    The frame is measured against the CAMERA'S OWN BOX, not the window.

    They are the same only while the screen is genuinely full-bleed, and it was
    not: an unregistered route inherited the stack header, so a bar sat over the
    top of the viewfinder and the camera saw ~200px less than the frame maths
    assumed. The frame is drawn in this box and the crop is expressed as a
    fraction of it, so measuring the thing itself cannot drift from what the
    lens has, whatever appears above it later.
  */
  const [box, setBox] = useState({ width: window.width, height: window.height });

  /*
    The frame, computed ONCE and used twice — drawn on screen, and applied to
    what the camera captured.

    The document scanner carries the same warning and it is worth repeating: a
    frame drawn from one calculation and cropped from another is a crop of the
    wrong rectangle. 85:55 is the size of every business card in the world.
  */
  const frame = useMemo(() => {
    const CARD_ASPECT = 85 / 55;
    const width = Math.min(box.width * 0.86, box.height * 0.5 * CARD_ASPECT);
    const height = width / CARD_ASPECT;
    return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
  }, [box.width, box.height]);

  /*
    A route is reachable by deep link whether or not a button points at it.

    The server refuses the save regardless, so nothing can be created without
    the permission — but letting somebody photograph a card, correct five
    fields and only then be refused is a waste of their time and an odd place
    to learn what they are not allowed to do.
  */
  const canAdd = holds(user, 'crmCreateClients') || holds(user, 'crmManageClients');
  const camera = useRef<CameraView>(null);

  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<ParsedCard | null>(null);
  const [values, setValues] = useState<CardValues>(EMPTY_VALUES);
  const [certain, setCertain] = useState<CardCertainty>({});
  /*
    The reader's guess, and the member's override of it.

    Held apart from `card` so "Scan again" cannot leave the previous card's
    answer selected under the new one's fields, and so the reason line keeps
    saying what the READER thought even after the member has disagreed with it.
  */
  const [kind, setKind] = useState<CardKind>('COMPANY');
  const [why, setWhy] = useState<ReturnType<typeof guessCardKind>['why']>('unsure');
  const [destination, setDestination] = useState<CardDestination>('client');
  const [company, setCompany] = useState<MobileCustomer | null>(null);
  /*
    WHICH ROWS OPENED UNDER "Worth a look", frozen when the card was read.

    ⚠️ Membership of a group must NOT follow what is being typed. Computed live,
    the first character into an empty field moves its row from one heading to
    the other, React unmounts the box being typed in, and the keyboard closes on
    the member mid-word. The COLOUR still follows the live value (see
    `fieldNeedsLook`), so a field that has been answered goes quiet where it is.
  */
  const [flagged, setFlagged] = useState<CardCertainty>({});
  /** Which row has its card lines open. One at a time — eight open lists is a wall. */
  const [picking, setPicking] = useState<CardFieldKey | null>(null);
  const [saving, setSaving] = useState(false);

  const capture = useCallback(async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    let shotUri: string | null = null;
    try {
      /*
        ⚠️ NEVER `skipProcessing: true` here.

        On Android that returns the frame exactly as the sensor recorded it —
        landscape, whatever way the phone is held. The preview is portrait, so
        `shot.width/height` then describe a DIFFERENT orientation from `box`,
        and `frameToImageCrop` maps the frame onto a rectangle with no relation
        to what the person aimed at. Nothing throws: the reader is simply handed
        the wrong third of the photograph, and the screen fills in whatever text
        happened to be there.

        It cost a real scan — a card whose name, phone, email and address were
        all outside the region, leaving only a logo. Processing costs a couple
        of hundred milliseconds and is what makes the frame mean anything.
      */
      const shot = await camera.current.takePictureAsync({ quality: 0.8 });
      if (!shot?.uri) return;
      shotUri = shot.uri;
      const image = { width: shot.width ?? 0, height: shot.height ?? 0 };
      const parsed = await scanBusinessCard(
        shot.uri,
        image,
        frameToImageCrop({ frame, screen: box, image }),
      );
      const guess = guessCardKind(parsed);
      const read = cardValues(parsed);
      const proved = cardCertainty(parsed);
      setCard(parsed);
      setValues(read);
      setCertain(proved);
      setFlagged(Object.fromEntries(CARD_FIELDS.map((key) => [key, fieldNeedsLook(read[key], proved[key])])));
      setKind(guess.kind);
      setWhy(guess.why);
      /*
        A fresh review every time. A person filed as a contact at Siemens on
        the last card must not leave Siemens selected under the next one — the
        save would be right about the fields and wrong about the company, which
        is the kind of mistake nobody notices until the office does.
      */
      setDestination('client');
      setCompany(null);
      setPicking(null);
      if (parsed.lines.length === 0) {
        toast.error(t('scan.nothingRead', 'Nothing could be read — try again with more light.'));
        setCard(null);
      }
    } catch {
      toast.error(t('scan.failed', 'Could not read the card.'));
    } finally {
      /*
        ⚠️ Delete the photograph. Always, including on failure.

        It is a picture of a named person's phone number and email address,
        sitting in a cache directory with no expiry and no purpose once the
        text has been read. The whole point of reading the card on the device
        is that the card does not travel; leaving the image behind quietly
        undoes that.
      */
      if (shotUri) {
        try { new FsFile(shotUri).delete(); } catch { /* already gone */ }
      }
      setBusy(false);
    }
    /*
      ⚠️ `box`, not `screen`. There is no `screen` in this component — it was
      renamed to `window` when the frame started being measured against the
      CAMERA's box, and this dependency array was the one use that did not get
      renamed with it.

      TypeScript could not catch it: `expo/tsconfig.base` sets
      `lib: ["DOM", "ESNext"]`, so `screen` is a perfectly good global as far as
      the compiler is concerned. At runtime it does not exist, so opening the
      scanner threw "Property 'screen' doesn't exist" before a frame was drawn.
    */
  }, [busy, t, toast, frame, box.width, box.height]);

  /*
    ── Editing what was read ──────────────────────────────────────────────────

    All three are stable across renders, so a keystroke in one row does not
    re-render the other seven. The rows are memoised on their props and take the
    field key rather than a closure written per row at the call site, which is
    what makes the memo worth having.

    ⚠️ Nothing here re-reads the card. The photograph is parsed ONCE, at
    capture, and deleted; these edit the answer, never the source.
  */
  const setValue = useCallback((key: CardFieldKey, value: string) => {
    setValues((p) => ({ ...p, [key]: value }));
  }, []);

  const toggleLines = useCallback((key: CardFieldKey) => {
    setPicking((p) => (p === key ? null : key));
  }, []);

  const pickLine = useCallback((key: CardFieldKey, line: string) => {
    setValues((p) => ({ ...p, [key]: line }));
    // Chosen by a person — no longer a guess, so the row stops asking.
    setCertain((p) => ({ ...p, [key]: true }));
    setPicking(null);
  }, []);

  const chooseDestination = useCallback((next: CardDestination, chosen: MobileCustomer | null) => {
    setDestination(next);
    setCompany(chosen);
  }, []);

  /*
    ⚠️ Changing the kind RESETS where the person was going.

    "Contact at Siemens" only means anything on a person's card — the question
    is not even asked on a firm's. Left standing it is state the screen has
    stopped showing and the save still reads: `ready` would be computed from the
    contact road (a company is chosen, so Save is lit) while the save itself
    takes the client road, and a firm would be created under the person's name
    with a company selected that nothing ever used.
  */
  const chooseKind = useCallback((next: CardKind) => {
    setKind(next);
    if (next === 'COMPANY') {
      setDestination('client');
      setCompany(null);
    }
  }, []);

  /*
    ── Saving ────────────────────────────────────────────────────────────────

    The two roads (a client, or a contact person at a company already in the
    book) are in `useSaveScannedCard`, with the outbox lane and the no-offline
    fallback each needs. What is decided here is only whether to save at all.
  */

  /** The name the record will carry — what a duplicate would be a duplicate OF. */
  const savedName = destination === 'contact' ? values.name.trim() : cardClientNames(kind, values).name;
  const ready = !!savedName && !(destination === 'contact' && !company);

  const commit = useCallback(async () => {
    setSaving(true);
    try {
      const outcome = await commitCard({ kind, destination, company, values, spaceId: spaceId || null });
      if (!outcome) {
        toast.error(t('customers.addFailed'));
        return;
      }
      if (outcome.kind === 'refused') {
        toast.error(
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
          outcome.message ||
          t('customers.addFailed'),
        );
        return;
      }
      toast.success(outcome.kind === 'queued' ? t('offline.savedForLater') : t('customers.added'));
      router.back();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || t('customers.addFailed'));
    } finally {
      setSaving(false);
    }
  }, [commitCard, kind, destination, company, values, spaceId, t, toast]);

  /*
    ⚠️ The duplicate search happens HERE and not on the way in: the name it
    searches is the one the member has just finished correcting. It runs once
    per review (see `useDuplicateCheck`), so a second press after the warning
    goes straight through — the member has seen the answer and decided.
  */
  const attemptSave = useCallback(async () => {
    if (saving || !ready) return;
    setSaving(true);
    const found = await duplicate.check(savedName);
    setSaving(false);
    if (found) return;
    await commit();
  }, [saving, ready, duplicate, savedName, commit]);

  const saveAnyway = useCallback(() => {
    duplicate.dismiss();
    void commit();
  }, [duplicate, commit]);

  const openExisting = useCallback((client: MobileCustomer) => {
    duplicate.dismiss();
    // `replace`, not `push`: the member chose the client that already exists
    // over the one they were about to make, so the review has nothing left to
    // come back to.
    router.replace(`/(app)/customer/${client.id}`);
  }, [duplicate]);

  // ── Allowed to add a client at all? ───────────────────────────────────────
  if (!canAdd) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
        <ScreenHeader title={t('scan.title', 'Scan a card')} />
        <View style={s.centre}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={[s.hint, { color: colors.textMuted }]}>
            {t('scan.notAllowed', 'You do not have permission to add clients.')}
          </Text>
        </View>
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
  if (card) {
    /*
      GROUPED BY CONFIDENCE, not listed flat.

      A row needs a look when the reader INFERRED it (`likely` — the name, the
      company, the address, the title) or found nothing at all. Everything else
      it proved by shape, and a proved field asking to be checked is how a
      screen teaches people to stop checking.

      Membership comes from `flagged` — what was true when the card was READ —
      and never from the live value; see the note where it is set.
    */
    const shown = cardFieldsFor(kind, destination);
    const needsLook = shown.filter((key) => flagged[key]);
    const captured = shown.filter((key) => !flagged[key]);
    const orphans = homelessFields(kind, destination, values);

    const row = (key: CardFieldKey) => (
      <CardFieldRow
        key={key}
        fieldKey={key}
        /* The one label that moves with the kind: on a firm's card the person
           named on it is the CONTACT, not the client. */
        label={key === 'name' && kind === 'COMPANY' ? t('customers.fContact') : t(FIELD_LABEL[key])}
        value={values[key]}
        attention={fieldNeedsLook(values[key], certain[key])}
        keyboardType={FIELD_INPUT[key]?.keyboardType}
        autoCapitalize={FIELD_INPUT[key]?.autoCapitalize}
        lines={card.lines}
        expanded={picking === key}
        onChange={setValue}
        onToggleLines={toggleLines}
        onPickLine={pickLine}
      />
    );

    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
        <ScreenHeader title={t('scan.review')} onBack={() => setCard(null)} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: SPACING.lg,
            // Scrolls under the system bar rather than stopping above it,
            // so the last control still clears it.
            paddingBottom: SPACING.xxxl + insets.bottom,
          }}
        >
          {/*
            ONE QUESTION, AT THE TOP, WITH ITS REASON.

            Everything below it — which fields are offered, where the person is
            filed, what the save even calls — follows from this answer, so it is
            asked first and it says why it guessed what it guessed. A guess that
            does not explain itself gets ignored rather than corrected.
          */}
          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t('scan.cardKind')}</Text>
          <View style={s.kindRow}>
            <ChoiceChip
              label={t('scan.kindCompany')}
              selected={kind === 'COMPANY'}
              onPress={() => chooseKind('COMPANY')}
            />
            <ChoiceChip
              label={t('scan.kindPerson')}
              selected={kind === 'PERSON'}
              onPress={() => chooseKind('PERSON')}
            />
          </View>
          <Text style={[s.why, { color: colors.textMuted }]}>{t(`scan.why.${why}`)}</Text>

          {needsLook.length > 0 && (
            <CardFieldGroup title={t('scan.needsLook')} hint={t('scan.needsLookHint')}>
              {needsLook.map((key) => row(key))}
            </CardFieldGroup>
          )}

          {captured.length > 0 && (
            <CardFieldGroup title={t('scan.captured')}>
              {captured.map((key) => row(key))}
            </CardFieldGroup>
          )}

          {/* A person has somewhere to BE. A company is already the client. */}
          {kind === 'PERSON' && (
            <CardDestinationPicker
              companyGuess={values.company}
              destination={destination}
              company={company}
              onChange={chooseDestination}
            />
          )}

          {/*
            ⚠️ What was read and cannot be kept, said out loud.

            This line is the whole point of the rebuild. The reader extracts
            more than any one record can hold — a person's own website, a firm's
            VAT number on a person's card, a job title with no company to hold
            it — and the screen that binned those silently is the bug being
            fixed. Naming them tells the member the one thing they can act on:
            the other kind, or the other destination, would keep it.
          */}
          {orphans.length > 0 && (
            <Text style={[s.orphans, { color: colors.textMuted }]}>
              {t('scan.notSaved', { fields: orphans.map((key) => t(FIELD_LABEL[key])).join(', ') })}
            </Text>
          )}

          <TouchableOpacity
            onPress={attemptSave}
            disabled={saving || !ready}
            style={[s.primary, { backgroundColor: ready ? COLORS.primary : colors.border }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || !ready, busy: saving }}
          >
            {saving ? <ActivityIndicator size="small" color={COLORS.white} />
                    : <Text style={s.primaryText}>{t(destination === 'contact' ? 'scan.saveContact' : 'customers.save')}</Text>}
          </TouchableOpacity>
          {/* The reason Save is still grey, rather than a button that does
              nothing when pressed. */}
          {!ready && (
            <Text style={[s.why, { color: colors.textMuted, textAlign: 'center' }]}>
              {t(destination === 'contact' && !company ? 'scan.needCompany' : 'scan.needName')}
            </Text>
          )}
          <TouchableOpacity style={s.ghost} onPress={() => setCard(null)}>
            <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.sm }}>{t('scan.again')}</Text>
          </TouchableOpacity>
        </ScrollView>

        <DuplicateSheet
          matches={duplicate.matches}
          saving={saving}
          onOpen={openExisting}
          onSaveAnyway={saveAnyway}
          onClose={duplicate.dismiss}
        />
      </SafeAreaView>
    );
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  return (
    <View
      style={s.black}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox((p) => (p.width === width && p.height === height ? p : { width, height }));
      }}
    >
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={s.camHead}>
          <TouchableOpacity onPress={() => router.back()} style={s.camBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* A card-shaped frame: 85×55mm is the standard, so the guide is the
            shape of the thing rather than a generic rectangle. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[s.guide, { left: frame.left, top: frame.top, width: frame.width, height: frame.height }]} />
          <Text style={[s.guideHint, { top: frame.top + frame.height + 16 }]}>
            {t('scan.frame', 'Fit the card inside the frame')}
          </Text>
        </View>

        <View style={s.camFoot}>
          <TouchableOpacity onPress={capture} disabled={busy} style={s.shutter}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterInner} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  black: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  hint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },

  camHead: { flexDirection: 'row', padding: SPACING.md },
  camBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  // Positioned from the computed frame, so what is drawn is what is cropped.
  guide: { position: 'absolute', borderWidth: 2, borderColor: '#22c55e', borderRadius: 12 },
  guideHint: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#e6ecf5', fontSize: FONT_SIZE.sm },
  /* ⚠️ `marginTop: 'auto'` is what puts the shutter at the BOTTOM.
     The card guide between the head and the foot is absolutely
     positioned, so it takes up no space in the column — without this
     the foot rides straight up under the close button, which is where
     the shutter was found sitting on a real phone. */
  camFoot: { marginTop: 'auto', alignItems: 'center', paddingBottom: SPACING.xl },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },

  /* The review's own furniture. The field row brings its own — see
     `card-field-row.tsx`, which is the single component every field uses. */
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  kindRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  why: { fontSize: FONT_SIZE.sm, lineHeight: 18, marginTop: SPACING.sm },
  orphans: { fontSize: FONT_SIZE.sm, lineHeight: 18, marginTop: SPACING.xl },

  primary: { borderRadius: RADIUS.md, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.xl },
  primaryText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  ghost: { alignItems: 'center', paddingVertical: SPACING.md },
});
