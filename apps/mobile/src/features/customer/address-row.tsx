import { memo } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText, Pill, RoundButton } from '../../components/amazen';
import { CallGlyph, NavigateGlyph } from '../../components/glyphs/work-glyphs';
import type { MobileCustomerAddress } from '../../lib/api/customers';
import { geoUrl, openSafeUrl, telUrl } from '../../lib/safe-links';


/**
 * One place the work happens: a label, the address, who is there.
 *
 * ⚠️ READ ONLY, deliberately. `customersApi` exposes `addresses(id)` and
 * nothing else — there is no create or update route on the mobile client — and
 * a panel with an Add button whose only possible outcome is a 404 is worse
 * than a panel that plainly lists what exists. Writing here means adding the
 * endpoints first.
 *
 * The one action offered is the one that needs no endpoint: hand the address
 * to the phone's maps app, which is what somebody standing in a van wants from
 * this card anyway.
 */
export const AddressRow = memo(function AddressRow({
  address,
  labels,
  first,
}: {
  address: MobileCustomerAddress;
  labels: { primary: string; navigate: string; call: string };
  first?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const text = address.address?.trim();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: amazen.space(3),
        paddingVertical: amazen.space(3),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.lineWell,
      }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14.5 }}>
            {address.label?.trim() || text || '—'}
          </AText>
          {address.isPrimary ? <Pill label={labels.primary} tone="accent" /> : null}
        </View>
        {/* Only when the label is not already the address itself. */}
        {text && address.label?.trim() ? <AText variant="caption" tone="ink">{text}</AText> : null}
        {address.contactName ? (
          <AText variant="caption" tone="muted" numberOfLines={1}>
            {address.contactName}{address.contactPhone ? ` · ${address.contactPhone}` : ''}
          </AText>
        ) : null}
      </View>
      {telUrl(address.contactPhone) ? (
        <RoundButton
          Glyph={CallGlyph}
          label={labels.call}
          size={34}
          onPress={() => void openSafeUrl(telUrl(address.contactPhone))}
        />
      ) : null}
      {/* `geo:` with a query is the platform-neutral form — Apple Maps on an iPhone, the person's own choice on Android. */}
      {geoUrl(text) ? (
        <RoundButton
          Glyph={NavigateGlyph}
          label={labels.navigate}
          size={34}
          onPress={() => void openSafeUrl(geoUrl(text))}
        />
      ) : null}
    </View>
  );
});
