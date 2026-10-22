import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { type OrgMember } from '@/lib/api';
import { AText } from '@/components/amazen';

/** MembersScreen's module-level helpers, moved here unchanged so its sections can read them too. */
export function RoleTag({ member }: { member: OrgMember }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const ext = !!member.isExternal;
  const label = ext ? t('members.externalOne', 'External') : member.memberRole?.name ?? t('members.noRoleOne', 'No role');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 3,
        backgroundColor: ext ? c.warnTint : c.tile,
        opacity: !ext && !member.memberRole ? 0.6 : 1,
        maxWidth: 110,
      }}>
      {!ext && member.memberRole?.color ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: member.memberRole.color }} />
      ) : null}
      <AText
        numberOfLines={1}
        style={{
          fontFamily: amazen.font.mono,
          fontSize: 9.5,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: ext ? c.warn : c.ink,
        }}
      >
        {label}
      </AText>
    </View>
  );
}

