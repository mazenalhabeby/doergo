import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { ClassifiedContact, PickSection } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { AText, type Tone } from '@/components/amazen';
import { Monogram } from '@/components/amazen/monogram';
import { personInitials } from '@hbcfield/shared/client';

/** Fixed, so the list can be measured without rendering — see `ROW_HEIGHT` use in the pick step. */
export const ROW_HEIGHT = 72;

/**
 * One contact in the picker.
 *
 * Memoised on what it SHOWS — the contact, its section, whether it is ticked —
 * so ticking one row re-renders one row, not the book. The handler is passed
 * the id rather than closed over it, which is what keeps it stable.
 */
export const ImportRow = memo(function ImportRow({
  contact, section, nested, on, members, onToggle,
}: {
  contact: ClassifiedContact;
  section: PickSection;
  nested: boolean;
  on: boolean;
  members?: string[];
  onToggle: (id: string, members?: string[]) => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();

  const sub = contact.kind === 'PERSON'
    ? [contact.role, contact.company].filter(Boolean).join(' · ') || contact.email || contact.phone || ''
    : contact.email || contact.phone || (members?.length ? t('contactsImport.pick.people', { count: members.length }) : '');
  const hint: { text: string; tone: Tone } | null =
    section === 'clients' ? { text: t('contactsImport.reason.CLIENT'), tone: 'warn' }
    : section === 'private' ? { text: t(`contactsImport.reason.${contact.reason}`), tone: 'critical' }
    : nested ? null
    : { text: t(`contactsImport.reason.${contact.reason}`), tone: section === 'suggested' ? 'accent' : 'muted' };

  // An academic title is not a name: "Dr. Anna Berger" is AB, not DA.
  const initials = personInitials(contact.name.replace(/^(dr|mag|ing|di)\.?\s+/i, ''), '');

  return (
    <Pressable
      onPress={() => onToggle(contact.id, members)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={[contact.name, sub, hint?.text].filter(Boolean).join(', ')}
      style={({ pressed }) => ({
        height: ROW_HEIGHT,
        flexDirection: 'row', alignItems: 'center', gap: amazen.space(3),
        paddingLeft: nested ? amazen.space(6) : 0,
        borderBottomWidth: 1, borderBottomColor: c.lineWell,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Monogram initials={initials} size={40} company={contact.kind === 'COMPANY'} tone="tile" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="body" tone="strong" numberOfLines={1}>{contact.name}</AText>
        {sub ? <AText variant="caption" tone="muted" numberOfLines={1}>{sub}</AText> : null}
        {hint ? <AText variant="caption" tone={hint.tone} numberOfLines={1}>{hint.text}</AText> : null}
      </View>
      <View style={{
        width: 28, height: 28, borderRadius: amazen.radius.full, alignItems: 'center', justifyContent: 'center',
        backgroundColor: on ? c.accentSolid : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: c.lineField,
      }}>
        {on ? (
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path d="m5 12 5 5 9-10" fill="none" stroke={c.accentInk} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
    </Pressable>
  );
});
