import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText, Pill, RoundButton } from '../amazen';
import { Monogram } from '../amazen/monogram';
import { CallGlyph } from '../glyphs/work-glyphs';
import { EmailGlyph } from '../glyphs/crm-glyphs';
import type { MobileCustomerContact } from '../../lib/api/customers';
import { mailtoUrl, openSafeUrl, telUrl } from '../../lib/safe-links';


/**
 * One end of a contact link, drawn the same whichever end you are standing on.
 *
 * ⚠️ ONE component, not two. "Who works at Siemens" and "which firms does Anna
 * contact for" are the SAME ROW (`CustomerContact`) asked from opposite sides —
 * `contacts(companyId)` fills `person`, `companies(personId)` fills `company`.
 * Two components would drift the moment one gained a primary star or a phone
 * button, and the panels would disagree about a single stored fact.
 *
 * So the row takes the link and is told which side to SHOW; everything else —
 * the role, the primary star, what may be done to it — is identical.
 */
interface ContactRowProps {
  link: MobileCustomerContact;
  side: 'person' | 'company';
  onOpen: (customerId: string) => void;
  /**
   * The row's other acts — make main contact, remove — live behind one "more"
   * button that opens the record's contact sheet. Two text actions on a row
   * that also rings and writes squeezed the name to nothing on a phone.
   */
  onMore?: (link: MobileCustomerContact) => void;
  labels: { primary: string; more: string; call: string; email: string };
  waiting?: string;
  busy?: boolean;
  /** No divider above the first row of a well. */
  first?: boolean;
}

function ContactRowBase({ link, side, onOpen, onMore, labels, waiting, busy, first }: ContactRowProps) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const end = side === 'person' ? link.person : link.company;
  if (!end) return null;
  const person = side === 'person' ? link.person : null;
  const primary = link.isPrimary === true;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: amazen.space(3),
        paddingVertical: amazen.space(2.75),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.lineWell,
        opacity: busy ? 0.5 : 1,
      }}>
      <Pressable
        onPress={() => onOpen(end.id)}
        disabled={busy || !!waiting}
        accessibilityRole={waiting ? 'text' : 'button'}
        accessibilityLabel={waiting ? `${end.name} — ${waiting}` : end.name}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: amazen.space(3),
          opacity: pressed ? 0.75 : 1,
        })}
      >
        {/* A person is round and a company square — the rule `ClientAvatar` keeps everywhere. */}
        <Monogram name={end.name} size={38} company={side === 'company'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14.5 }}>{end.name}</AText>
            {primary ? <Pill label={labels.primary} tone="accent" /> : null}
            {waiting ? <Pill label={waiting} tone="warn" /> : null}
          </View>
          {/* What this person does here — one line; the waiting mark already said the other thing. */}
          {!waiting && link.role ? <AText variant="caption" tone="muted" numberOfLines={1}>{link.role}</AText> : null}
        </View>
      </Pressable>
      {telUrl(person?.phone) ? (
        <RoundButton
          Glyph={CallGlyph}
          label={labels.call}
          size={34}
          onPress={() => void openSafeUrl(telUrl(person?.phone))}
        />
      ) : null}
      {mailtoUrl(person?.email) ? (
        <RoundButton
          Glyph={EmailGlyph}
          label={labels.email}
          size={34}
          onPress={() => void openSafeUrl(mailtoUrl(person?.email))}
        />
      ) : null}
      {onMore ? (
        <Pressable onPress={() => onMore(link)} disabled={busy} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${labels.more}: ${end.name}`}
          style={({ pressed }) => ({ width: 30, height: 34, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <AText variant="body" tone="muted" style={{ fontSize: 18, lineHeight: 20 }}>⋯</AText>
        </Pressable>
      ) : null}
    </View>
  );
}

export const ContactRow = memo(ContactRowBase);
