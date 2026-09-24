import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useDocumentRequirements } from '../../contexts/document-requirements-context';
import { useSyncStatus } from '../../offline/offline-context';
import { homeDestinationsFor, type Destination, type BadgeSource } from '../../lib/manage-rows';
/* The selection rule is not rendering — see `lib/shortcut-tiles.ts`. */
import { chooseTiles, TILE_SIZE, TILE_GAP, type BadgeCounts } from '../../lib/shortcut-tiles';
import { AText, Well } from '../amazen';
import type { GlyphProps } from '../glyphs/glyphs';
import { DocumentsGlyph, SendDocumentGlyph, SupportGlyph } from '../glyphs/glyphs';
import {
  SignGlyph, MyEquipmentGlyph, SyncGlyph, OvertimeGlyph, ScanCardGlyph,
  AddClientGlyph, EquipmentLogGlyph, NewJobGlyph,
} from '../glyphs/tile-glyphs';
import { ExpenseQueueGlyph } from '../glyphs/queue-glyphs';
import { PlanRouteGlyph } from '../glyphs/route-glyphs';

/**
 * A toolbar of doorways.
 *
 * Three catalogue rows fold in here — messages, credentials and sync — because
 * none of them changes WHAT YOU DO based on its detail. You look at the number
 * and either you go or you don't, and that is a button. A widget that renders
 * "the last two senders" gives you two names you will read again in the thread
 * one tap later.
 *
 * ⚠️ THE RAIL MAKES NO REQUEST. It renders from `homeDestinationsFor(user)`,
 * which is a filter over a local table, and every badge is a count something
 * else on this screen already fetched. A badge must NEVER be the only reason a
 * request happens — a tile renders without its number rather than firing a
 * call to decorate itself.
 *
 * ⚠️ AND IT OWNS NO GATE. If the rail and the Manage list ever disagree about
 * who may open Clients, the bug is in `manage-rows.ts` and the fix belongs
 * there. This file decides ORDER and nothing else.
 */

/**
 * The mark for each destination.
 *
 * Keyed by the row's label key rather than held on the row, because the table
 * is read by three surfaces and two of them draw Ionicons at 20px in a list.
 * A glyph is presentation; a gate is not, and only one of the two may live in
 * two places.
 *
 * ⚠️ Five of these already existed and are REUSED, not redrawn —
 * `DocumentsGlyph`, `SendDocumentGlyph`, `SupportGlyph`. A family with two
 * marks for one thing is not a family. `EquipmentGlyph` and
 * `MyEquipmentGlyph` both survive on purpose: *equipment* and *the box that is
 * yours* are two claims.
 */
const GLYPHS: Record<string, React.ComponentType<GlyphProps>> = {
  'shortcuts.documents': DocumentsGlyph,
  'shortcuts.newJob': NewJobGlyph,
  'shortcuts.sign': SignGlyph,
  'shortcuts.myEquipment': MyEquipmentGlyph,
  'shortcuts.sync': SyncGlyph,
  'shortcuts.overtime': OvertimeGlyph,
  'shortcuts.logExpense': ExpenseQueueGlyph,
  'shortcuts.scanCard': ScanCardGlyph,
  'shortcuts.addClient': AddClientGlyph,
  'shortcuts.sendDoc': SendDocumentGlyph,
  'shortcuts.planRoute': PlanRouteGlyph,
  'shortcuts.support': SupportGlyph,
  'shortcuts.equipmentLog': EquipmentLogGlyph,
};

/**
 * ⚠️ A PERSON is waiting, or a THING is.
 *
 * The only colour decision in the widget and it is worth keeping: a red badge
 * on Sync would put a queued photo upload on the same footing as somebody who
 * has not turned up.
 *
 * Empty today: Messages was the one tile where a PERSON was waiting, and it
 * took a tab slot in v2. The list stays because the distinction is the rule,
 * not the row — the next tile with somebody at the other end of it belongs
 * here, and finding that out by reading this is cheaper than rediscovering it.
 */
const PEOPLE_BADGES: BadgeSource[] = [];


export function ShortcutsRail({ style }: { style?: object }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const docs = useDocumentRequirements();
  /*
    ⚠️ THE ONE BADGE WITH A LOCAL SOURCE, WHICH IS WHY IT IS ALLOWED.

    `STATES.md` — "Badges fall back to their last known value ONLY where the
    source is local (the sync queue), and are otherwise absent." The outbox is
    on this phone; reading it costs nothing and asks nobody. Every other count
    has to already be on screen for another reason, or the tile draws plain.
  */
  const { snapshot } = useSyncStatus();

  const counts: BadgeCounts = {
    /*
      Already on screen for another reason — the documents reminder fetched
      these on mount and this reads the same context rather than asking again.
      Expiries are deliberately NOT counted: a certificate that runs out in
      three weeks is not something anybody is late for, and a badge that lights
      up for it teaches people to ignore the badge.
    */
    'documents.due': docs.total || undefined,
    'documents.toSign': docs.toSign.length || undefined,
    // Waiting to send, plus whatever needs a person to look at it.
    'sync.queued': (snapshot.waiting + snapshot.attention) || undefined,
    // The rest have no source on this screen yet, and so draw no number.
  };

  const available = homeDestinationsFor(user as never);
  const chosen = chooseTiles(available, counts);

  /*
    ⚠️ ONE TILE IS NOT A WIDGET. One tile is a button that has learned to look
    like a widget; it belongs on the screen it opens, not in a card of its own.
  */
  if (chosen.length < 2) return null;

  return (
    <Well style={[{ padding: amazen.space(3.5) }, style]}>
      {/*
        ⚠️ LEFT-ALIGNED AT THEIR REAL SIZE — NOT STRETCHED TO FILL THE WIDTH.

        `STATES.md` ④: two tiles are still a card, with two empty columns of
        air beside them. The tiles are 71pt because that is what a 26px mark
        needs, and a 150pt tile with a 26px mark in it looks like a mistake.
        `flex: 1` made exactly that shape the moment a member had two modules
        instead of four.
      */}
      <View style={{ flexDirection: 'row', gap: TILE_GAP, justifyContent: 'flex-start' }}>
        {chosen.map((d) => (
          <Tile
            key={d.labelKey}
            destination={d}
            count={d.badge ? counts[d.badge] : undefined}
            onPress={() => router.push(d.route as Href)}
            label={t(d.labelKey, { defaultValue: d.labelKey.split('.').pop() ?? '' })}
          />
        ))}
      </View>
    </Well>
  );
}

function Tile({
  destination, count, label, onPress,
}: {
  destination: Destination;
  count?: number;
  label: string;
  onPress: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const Glyph = GLYPHS[destination.labelKey] ?? DocumentsGlyph;
  const people = destination.badge ? PEOPLE_BADGES.includes(destination.badge) : false;
  const badgeBg = people ? c.critical : c.warn;
  const badgeInk = people ? c.criticalInk : c.warnInk;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      /* ⚠️ The badge is not decoration — it is half the label. */
      accessibilityLabel={count && count > 0 ? `${label}, ${count}` : label}
      style={({ pressed }) => ({ width: TILE_SIZE, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}
    >
      <View
        style={{
          width: TILE_SIZE,
          height: TILE_SIZE,
          borderRadius: amazen.radius.tile,
          backgroundColor: c.tile,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.lineWell,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* `contrast` is the tile composited over the well — the surface, not a
            colour choice. Wrong and it draws a grey ghost across the mark. */}
        <Glyph size={26} color={c.inkStrong} contrast={c.well} />
        {count && count > 0 ? (
          <View
            style={{
              position: 'absolute', top: -4, right: -4,
              minWidth: 20, height: 20, paddingHorizontal: 5,
              borderRadius: amazen.radius.full,
              backgroundColor: badgeBg,
              borderWidth: 2, borderColor: c.well,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {/* ⚠️ Caps at 9+. Two characters is the tile's whole budget, and
                past nine the exact number stops changing the decision. */}
            <AText variant="caption" numeric style={{ color: badgeInk, lineHeight: 16 }}>
              {count > 9 ? '9+' : String(count)}
            </AText>
          </View>
        ) : null}
      </View>
      {/*
        ⚠️ Two lines from the start, not stretched later when somebody notices.
        German will not fit "My equipment" in two words.
      */}
      <AText
        variant="caption"
        tone="muted"
        numberOfLines={2}
        style={{ marginTop: 6, textAlign: 'center' }}
      >
        {label}
      </AText>
    </Pressable>
  );
}
