import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { over } from '../../theme/amazen';
import { useDocumentRequirements } from '../../contexts/document-requirements-context';
import { documentsApi, type DocumentType } from '../../lib/api/documents';
import { AText, Eyebrow, LiveDot, PrimaryButton } from '../amazen';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { SupplyDocumentSheet } from '../supply-document-sheet';
import { SignGlyph } from '../glyphs/tile-glyphs';
import { CountersignGlyph, DocBlockedGlyph, DocExpiringGlyph, DocNeededGlyph, DocSentBackGlyph } from '../glyphs/doc-glyphs';
import { itemLines, stripItems, stripLines, stripTone, type StripItem, type StripTone } from './action-strip-state';
import { usePhrase, type Phrase } from './phrase';
import { GlyphTile } from './glyph-tile';
import type { GlyphProps } from '../glyphs/glyphs';

/**
 * ⭐ THE ACTION STRIP — what the app needs from the member, under the header.
 *
 * Chrome, not a widget: it is not in the registry, cannot be moved or hidden,
 * and is not drawn at all when nothing waits (no "all caught up"). No dismiss —
 * it goes when the work is done.
 *
 * ONE item → the strip names it, and a tap goes STRAIGHT to it.
 * SEVERAL  → the count is the mark, the second line carries the sharpest fact,
 *            and a tap opens the same popup as the shift widget (BlurSheet +
 *            SheetPanel) listing them in the slot order; five or more scroll.
 *
 * ⭐ EVERY ROW GOES DIRECTLY TO ITS THING, never to a list to find it again:
 *   sign / countersign → the signing flow on that document
 *   sent back / to upload / running out → the upload sheet, that type chosen
 */

const ROW_H = 62;
const VISIBLE_ROWS = 4.5;

export function ActionStrip() {
  const { amazen, colors } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const router = useRouter();
  const reqs = useDocumentRequirements();
  const say = usePhrase();

  const items = useMemo(
    () => stripItems({ toUpload: reqs.toUpload, rejected: reqs.rejected, toSign: reqs.toSign, expiringSoon: reqs.expiringSoon }),
    [reqs.toUpload, reqs.rejected, reqs.toSign, reqs.expiringSoon],
  );
  const [open, setOpen] = useState(false);
  const [supply, setSupply] = useState<{ typeId: string } | null>(null);
  const [types, setTypes] = useState<DocumentType[] | null>(null);

  /* It slides in ONCE, on arrival, and never animates to get attention again. */
  const arrive = useRef(new Animated.Value(0)).current;
  const shown = reqs.ready && items.length > 0;
  useEffect(() => {
    if (shown) Animated.timing(arrive, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    else arrive.setValue(0);
  }, [shown, arrive]);

  /* The upload sheet needs the catalogue; fetched only once somebody goes there. */
  const loadTypes = async () => {
    if (types) return types;
    const ts = await documentsApi.listTypes();
    setTypes(ts);
    return ts;
  };

  const go = (item: StripItem) => {
    setOpen(false);
    if (item.documentId) {
      router.push({ pathname: '/sign-document', params: { id: item.documentId, title: item.label } } as unknown as Href);
      return;
    }
    if (item.typeId) {
      const typeId = item.typeId;
      loadTypes()
        .then(() => setSupply({ typeId }))
        // The catalogue would not load: the documents screen reports its own failures.
        .catch(() => router.push('/documents' as Href));
    }
  };

  if (!shown) return null;

  const tone = stripTone(items);
  const lines = stripLines(items)!;
  const ink = tone === 'crit' ? c.critical : tone === 'warn' ? c.warn : c.ink;
  /*
    ⚠️ OPAQUE, BECAUSE THE GLYPH IS PUNCHED. `contrast` must be the exact
    colour behind the mark (docs/design/icons/README.md rule 2), and a
    translucent strip over the home gradient has no single colour. So the
    strip is the tint composited over the gradient where it sits, and the
    mark's tile is composited over the strip — both solid, both matchable.
  */
  const ground = over(`${amazen.gradient.home[1]}80`, amazen.gradient.home[0]);
  const tint = over(tone === 'crit' ? c.criticalTint : tone === 'warn' ? c.warnTint : c.tile, ground);
  const single = items.length === 1;

  return (
    <>
      <Animated.View
        style={{
          opacity: arrive,
          transform: [{ translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
          marginBottom: amazen.space(3),
        }}
      >
        <Pressable
          onPress={() => (single ? go(items[0]!) : setOpen(true))}
          accessibilityRole="button"
          accessibilityLabel={`${say(lines.title)}. ${say(lines.sub)}`}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: amazen.space(3),
            minHeight: 54, paddingVertical: 11, paddingHorizontal: 14,
            borderRadius: 18, borderWidth: 1, borderColor: tone === 'calm' ? c.lineGlass : `${ink}2e`,
            backgroundColor: tint, opacity: pressed ? 0.85 : 1,
          })}
        >
          {/* One item: its mark. Several: the count sits where the mark sat. */}
          <GlyphTile Glyph={single ? glyphFor(items[0]!) : undefined} color={ink} tint={tone === 'calm' ? c.tile : `${ink}1f`} behind={tint} glyphSize={17}>
            <AText variant="h3" numeric style={{ color: ink, fontSize: 19, lineHeight: 24 }}>{items.length}</AText>
          </GlyphTile>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 19, fontFamily: amazen.font.sansMedium }}>
              {say(lines.title)}
            </AText>
            <AText variant="caption" numberOfLines={2} style={{ color: tone === 'calm' ? c.inkMuted : ink, marginTop: 1 }}>
              {say(lines.sub)}
            </AText>
          </View>
          <AText variant="body" style={{ color: tone === 'calm' ? c.inkMuted : ink }}>›</AText>
        </Pressable>
      </Animated.View>

      <BlurSheet visible={open} onClose={() => setOpen(false)}>
        <SheetPanel onClose={() => setOpen(false)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1) }}>
            <LiveDot color={tone === 'calm' ? c.inkMuted : ink} />
            <Eyebrow tone={tone === 'crit' ? 'critical' : tone === 'warn' ? 'warn' : 'muted'}>
              {t(tone === 'crit' ? 'strip.eyebrow.stopping' : tone === 'calm' ? 'strip.eyebrow.comingUp' : 'strip.eyebrow.waiting')}
            </Eyebrow>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: amazen.space(2), marginTop: amazen.space(2) }}>
            <AText variant="displaySm" numeric style={{ color: tone === 'calm' ? c.inkStrong : ink }}>{items.length}</AText>
            <AText variant="h3" tone="ink">
              {t(items.every((i) => i.blocksWork) ? 'strip.heroStopping' : 'strip.heroNeed', { count: items.length })}
            </AText>
          </View>
          <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>{say(lines.sub)}</AText>

          <FadingList items={items} tone={tone} onPick={go} say={say} surface={colors.card} />

          <PrimaryButton
            label={t('strip.startFirst', { defaultValue: 'Start with the first' })}
            onPress={() => go(items[0]!)}
            style={{ marginTop: amazen.space(4) }}
          />
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" hitSlop={10} style={{ alignSelf: 'center', marginTop: amazen.space(3) }}>
            <AText variant="caption" tone="muted">{t('strip.notNow', { defaultValue: 'Not now' })}</AText>
          </Pressable>
        </SheetPanel>
      </BlurSheet>

      <SupplyDocumentSheet
        types={types ?? []}
        visible={!!supply}
        initialTypeId={supply?.typeId ?? null}
        onClose={() => setSupply(null)}
        /* Supplying is exactly when the strip stops being true. */
        onSubmitted={() => { setSupply(null); void reqs.refresh({ force: true }); }}
      />
    </>
  );
}

/** The list inside the popup: every item, oldest-rank first; past 4½ rows it scrolls, with soft edges. */
function FadingList({ items, tone, onPick, say, surface }: {
  items: StripItem[]; tone: StripTone; onPick: (i: StripItem) => void; say: (p: Phrase) => string; surface: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const scrolls = items.length > VISIBLE_ROWS;
  const [edges, setEdges] = useState({ top: false, bottom: scrolls });
  useEffect(() => setEdges({ top: false, bottom: scrolls }), [scrolls]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const top = contentOffset.y > 2;
    const bottom = contentOffset.y + layoutMeasurement.height < contentSize.height - 2;
    if (top !== edges.top || bottom !== edges.bottom) setEdges({ top, bottom });
  };
  void tone;

  return (
    <View style={{ marginTop: amazen.space(4), maxHeight: ROW_H * VISIBLE_ROWS }}>
      <ScrollView scrollEnabled={scrolls} onScroll={onScroll} scrollEventThrottle={32} showsVerticalScrollIndicator={false} bounces={scrolls}>
        {items.map((item, i) => {
          const l = itemLines(item);
          const ink = item.blocksWork ? c.critical : item.kind === 'expiring' ? c.inkMuted : c.warn;
          return (
            <Pressable
              key={item.key}
              onPress={() => onPick(item)}
              accessibilityRole="button"
              accessibilityLabel={`${say(l.title)}. ${say(l.sub)}`}
              style={({ pressed }) => ({
                height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: amazen.space(3),
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell, opacity: pressed ? 0.7 : 1,
              })}
            >
              <GlyphTile Glyph={glyphFor(item)} color={ink} tint={item.kind === 'expiring' ? c.tile : `${ink}1f`} behind={surface} glyphSize={16} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 19 }}>{say(l.title)}</AText>
                <AText variant="caption" numberOfLines={1} style={{ color: item.blocksWork ? c.critical : c.inkMuted, marginTop: 1 }}>{say(l.sub)}</AText>
              </View>
              <AText variant="body" tone="muted">›</AText>
            </Pressable>
          );
        })}
      </ScrollView>
      {scrolls ? (
        <>
          <LinearGradient pointerEvents="none" colors={[surface, `${surface}00`]}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 26, opacity: edges.top ? 1 : 0 }} />
          <LinearGradient pointerEvents="none" colors={[`${surface}00`, surface]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 26, opacity: edges.bottom ? 1 : 0 }} />
        </>
      ) : null}
    </View>
  );
}

/** Each kind's mark, from the document family (glyphs/doc-glyphs.tsx). */
function glyphFor(item: StripItem): React.ComponentType<GlyphProps> {
  switch (item.kind) {
    case 'sign': return SignGlyph;
    case 'countersign': return CountersignGlyph;
    case 'sentBack': return DocSentBackGlyph;
    case 'expiring': return DocExpiringGlyph;
    case 'upload': return item.blocksWork ? DocBlockedGlyph : DocNeededGlyph;
  }
}
