import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { isCompany } from '@hbcfield/shared/client';
import type { MobileCustomer } from '../../lib/api';
import { AText } from '../amazen';
import { Monogram } from '../amazen/monogram';
import { CallGlyph } from '../glyphs/work-glyphs';
import { openSafeUrl, telUrl } from '../../lib/safe-links';

/**
 * One client in the book.
 *
 * ⚠️ Memoized and handed only the client, strings and stable callbacks:
 * appending a page re-renders the list, and every row redrawing is the
 * difference between paging that feels instant and a stutter at each page.
 *
 * The row is drawn as a slice of one well — `first` rounds the top, `last` the
 * bottom — so a FlatList can recycle rows and the book still reads as one card.
 *
 * ⚠️ Square for a company, round for a person — the SHAPE carries it, one
 * colour either way (`ClientAvatar`, and the web's list, say the same).
 */
export const ClientRow = memo(function ClientRow({
  client, first, last, stage, detail, tag, onOpen,
}: {
  client: MobileCustomer;
  first: boolean;
  last: boolean;
  /** Already in words — "Customer", "Lead". */
  stage: string;
  /** Phone or email, and the workspace when that is worth a mention. */
  detail: string;
  /** CONTACT or APP, or nothing. One at a time: two squeeze the name. */
  tag: { label: string; tone: 'accent' | 'muted' } | null;
  onOpen: (id: string) => void;
}) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const company = isCompany(client);
  // A contact is somebody else's person in a list of your clients: readable, plainly not the same thing.
  const contact = client.isContact === true;
  const customer = client.status === 'CUSTOMER';
  const phone = client.phone?.trim();
  const r = amazen.radius.panel;
  return (
    <View style={{
      backgroundColor: c.well, paddingHorizontal: amazen.space(3.5),
      borderTopLeftRadius: first ? r : 0, borderTopRightRadius: first ? r : 0,
      borderBottomLeftRadius: last ? r : 0, borderBottomRightRadius: last ? r : 0,
      paddingTop: first ? amazen.space(1) : 0, paddingBottom: last ? amazen.space(1) : 0,
    }}>
      <Pressable
        onPress={() => onOpen(client.id)}
        accessibilityRole="button"
        accessibilityLabel={`${client.name}, ${stage}`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.75),
          borderTopWidth: first ? 0 : 1, borderTopColor: c.lineWell, opacity: pressed ? 0.75 : contact ? 0.62 : 1,
        })}
      >
        <Monogram name={client.name} size={42} company={company} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{client.name}</AText>
          <AText variant="caption" numberOfLines={1} style={{ color: c.inkMuted }}>
            <AText
              variant="caption"
              style={{
                fontFamily: amazen.font.mono,
                fontSize: 10.5,
                letterSpacing: 0.8,
                color: customer ? c.accent : c.inkMuted,
              }}
            >
              {stage.toUpperCase()}
            </AText>
            {detail ? ` · ${detail}` : ''}
          </AText>
        </View>
        {tag ? (
          <View
            style={{
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 3,
              backgroundColor: tag.tone === 'accent' ? c.accentTint : c.tile,
            }}>
            <AText
              variant="caption"
              style={{
                fontFamily: amazen.font.mono,
                fontSize: 9.5,
                letterSpacing: 0.8,
                color: tag.tone === 'accent' ? c.accent : c.ink,
              }}
            >
              {tag.label.toUpperCase()}
            </AText>
          </View>
        ) : null}
        {phone ? (
          /* Ring from the row — the rest of the row opens the record. */
          <Pressable
            onPress={() => { void openSafeUrl(telUrl(phone)).then((opened) => { if (!opened) onOpen(client.id); }); }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={phone}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c.accentSolid,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <CallGlyph size={17} color={c.accentInk} contrast={isDark ? '#1fc39c' : '#0f9a7c'} />
          </Pressable>
        ) : (
          <AText variant="body" tone="muted">›</AText>
        )}
      </Pressable>
    </View>
  );
});
