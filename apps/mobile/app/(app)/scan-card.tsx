import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput,
  useWindowDimensions,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenHeader } from '../../src/components';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { scanBusinessCard, type ParsedCard } from '../../src/lib/card-scan';
import { frameToImageCrop } from '@hbcfield/shared/client';
import { MediaAccessScreen } from '../../src/permissions/media-access-screen';
import { useCameraAccess } from '../../src/permissions/use-media-access';
import { customersApi } from '../../src/lib/api';
import { File as FsFile } from 'expo-file-system';
import { useAuth } from '../../src/contexts/auth-context';
import { holds } from '../../src/lib/permissions';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import { useQueuedCreate } from '../../src/offline/actions/queued-create';

/**
 * Scan a business card into a client.
 *
 * Two states in one screen: the camera, then what was read. They are not
 * separate routes because the second is a review of the first — going "back"
 * from the review must return to the camera, not to the client list.
 *
 * ⚠️ Nothing saves without the person seeing it. Fields the reader can PROVE
 * (email, phone, website) are marked certain; fields it INFERS (name, company,
 * title) are marked as needing a look, and every line the card gave stays
 * available so a wrong guess is one tap to fix rather than a re-scan.
 */

type FieldKey = 'name' | 'company' | 'title' | 'email' | 'phone';

export default function ScanCardScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const clientCreate = useQueuedCreate('customer.create');
  const cam = useCameraAccess();
  const { user } = useAuth();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();

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
  const [values, setValues] = useState<Record<FieldKey, string>>({
    name: '', company: '', title: '', email: '', phone: '',
  });
  const [certain, setCertain] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [picking, setPicking] = useState<FieldKey | null>(null);
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
      setCard(parsed);
      setValues({
        name: parsed.name?.value ?? '',
        company: parsed.company?.value ?? '',
        title: parsed.title?.value ?? '',
        email: parsed.email?.value ?? '',
        phone: parsed.phone?.value ?? '',
      });
      setCertain({
        name: parsed.name?.confidence === 'certain',
        company: parsed.company?.confidence === 'certain',
        title: parsed.title?.confidence === 'certain',
        email: parsed.email?.confidence === 'certain',
        phone: parsed.phone?.confidence === 'certain',
      });
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

  const save = useCallback(async () => {
    const name = (values.company || values.name).trim();
    if (!name) return;
    setSaving(true);
    try {
      const input = {
        name,
        // The company is the client; the person on the card is the contact.
        contactName: values.company ? values.name.trim() || undefined : undefined,
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
      };
      // The card's fields go to the client they create, and nowhere else — held
      // in the member's encrypted outbox until there is a signal to send them.
      const outcome = await clientCreate.run({ lane: 'crm:new', body: input }, () => customersApi.create(input));
      if (outcome.kind === 'refused') {
        toast.error((outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('customers.addFailed', 'Could not add the client'));
        return;
      }
      toast.success(outcome.kind === 'queued' ? t('offline.savedForLater') : t('customers.added', 'Client added'));
      router.back();
    } catch (e: any) {
      toast.error(e?.message || t('customers.addFailed', 'Could not add the client'));
    } finally {
      setSaving(false);
    }
  }, [values, t, toast, clientCreate]);

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
    const field = (key: FieldKey, label: string) => (
      <View key={key} style={[s.field, { borderColor: certain[key] ? 'rgba(22,163,74,.45)' : 'rgba(245,158,11,.5)' }]}>
        <View style={s.fieldHead}>
          <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
          <Text style={[s.badge, certain[key] ? s.badgeOk : s.badgeCheck]}>
            {certain[key] ? t('scan.found', 'FOUND') : t('scan.check', 'CHECK')}
          </Text>
        </View>
        <TextInput
          value={values[key]}
          onChangeText={(v) => setValues((p) => ({ ...p, [key]: v }))}
          placeholder="—"
          placeholderTextColor={colors.textMuted}
          autoCapitalize={key === 'email' ? 'none' : 'words'}
          style={[s.fieldInput, { color: colors.textPrimary }]}
        />
        <TouchableOpacity onPress={() => setPicking(picking === key ? null : key)}>
          <Text style={[s.pick, { color: COLORS.primary }]}>
            {picking === key ? t('scan.hideLines', 'Hide lines') : t('scan.otherLine', 'Pick a different line')}
          </Text>
        </TouchableOpacity>
        {picking === key && (
          <View style={s.lines}>
            {card.lines.map((line, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  setValues((p) => ({ ...p, [key]: line }));
                  // Chosen by a person — no longer a guess.
                  setCertain((p) => ({ ...p, [key]: true }));
                  setPicking(null);
                }}
                style={[s.lineRow, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZE.sm }} numberOfLines={1}>{line}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );

    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
        <ScreenHeader title={t('scan.review', 'Check before saving')} onBack={() => setCard(null)} />
        <ScrollView
          contentContainerStyle={{
            padding: SPACING.lg,
            // Scrolls under the system bar rather than stopping above it,
            // so the last control still clears it.
            paddingBottom: SPACING.xxxl + insets.bottom,
          }}
        >
          {field('company', t('customers.fName', 'Company'))}
          {field('name', t('customers.fContact', 'Contact person'))}
          {field('title', t('scan.jobTitle', 'Job title'))}
          {field('email', t('customers.fEmail', 'Email'))}
          {field('phone', t('customers.fPhone', 'Phone'))}

          <TouchableOpacity
            onPress={save}
            disabled={saving || !(values.company || values.name).trim()}
            style={[s.primary, { backgroundColor: (values.company || values.name).trim() ? COLORS.primary : colors.border }]}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.primaryText}>{t('customers.save', 'Save client')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.ghost} onPress={() => setCard(null)}>
            <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.sm }}>{t('scan.again', 'Scan again')}</Text>
          </TouchableOpacity>
        </ScrollView>
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

  field: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  badge: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, overflow: 'hidden' },
  badgeOk: { color: '#4ade80', backgroundColor: 'rgba(22,163,74,.16)' },
  badgeCheck: { color: '#fbbf24', backgroundColor: 'rgba(245,158,11,.16)' },
  fieldInput: { fontSize: FONT_SIZE.base, paddingVertical: 6 },
  pick: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold as any },
  lines: { marginTop: SPACING.sm, gap: 6 },
  lineRow: { borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: 9, paddingHorizontal: SPACING.md },

  primary: { borderRadius: RADIUS.md, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm },
  primaryText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '700' },
  ghost: { alignItems: 'center', paddingVertical: SPACING.md },
});
