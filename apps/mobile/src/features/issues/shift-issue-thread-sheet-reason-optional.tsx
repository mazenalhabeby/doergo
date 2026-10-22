import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { shiftIssuesApi } from '@/lib/api/shift-issues';
import { AText, Eyebrow } from '@/components/amazen';
import { ENDING_REASONS } from './shift-issue-thread-sheet-helpers';
import type { ShiftIssueThreadSheetState } from './use-shift-issue-thread-sheet';

/** Part of ShiftIssueThreadSheet's markup, moved here unchanged; it reads the page's state from `vm`. */
export function ShiftIssueThreadSheetReasonOptional({ vm }: { vm: ShiftIssueThreadSheetState }) {
  const {
    ending,
    amazen,
    t,
    reason,
    setReason,
    c,
    setEnding,
    act,
    issue,
    viewing,
  } = vm;
  if ((viewing)) return null;
  if ((!issue)) return null;
  return (
    <>{ending ? (
      <View style={{ marginTop: amazen.space(4), gap: amazen.space(2) }}>
        <Eyebrow tone="muted">
          {t('issues.reasonOptional', { defaultValue: 'Reason (optional)' })}
        </Eyebrow>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2) }}>
          {ENDING_REASONS[ending].map((k) => {
            const label = t(`issues.resolveReasons.${k}`, { defaultValue: k });
            const on = reason === label;
            return (
              <Pressable
                key={k}
                onPress={() => setReason(on ? '' : label)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  paddingHorizontal: amazen.space(3),
                  paddingVertical: amazen.space(2),
                  borderRadius: amazen.radius.full,
                  backgroundColor: c.tile,
                  borderWidth: 1.5,
                  borderColor: on ? c.inkStrong : 'transparent',
                }}
              >
                <AText variant="caption" tone={on ? 'strong' : 'muted'}>{label}</AText>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={400}
          placeholder={t('issues.reasonPlaceholder', { defaultValue: 'Anything to add?' })}
          placeholderTextColor={c.inkMuted}
          style={{
            backgroundColor: c.sunken,
            borderRadius: amazen.radius.field,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: c.lineField,
            paddingHorizontal: amazen.space(3),
            paddingVertical: amazen.space(2.5),
            color: c.inkStrong,
            fontFamily: amazen.font.sans,
            fontSize: 15,
            height: 64,
            textAlignVertical: 'top',
          }}
        />
        <Pressable
          onPress={() => {
            const note = reason.trim() || undefined;
            const to = ending === 'resolve' ? 'RESOLVED' : 'CANCELED';
            setEnding(null); setReason('');
            void act(() => shiftIssuesApi.setStatus(issue.id, to, note));
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            paddingVertical: amazen.space(3),
            alignItems: 'center',
            borderRadius: amazen.radius.full,
            backgroundColor: c.accentSolid,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
            {ending === 'resolve'
              ? t('issues.confirmResolve', { defaultValue: 'Mark it resolved' })
              : t('issues.confirmWithdraw', { defaultValue: 'Withdraw it' })}
          </AText>
        </Pressable>
        <Pressable
          onPress={() => { setEnding(null); setReason(''); }}
          accessibilityRole="button"
          hitSlop={8}
          style={{ alignSelf: 'center' }}
        >
          <AText variant="caption" tone="muted">{t('shiftEnd.notYet', { defaultValue: 'Not yet' })}</AText>
        </Pressable>
      </View>
    ) : null}</>
  );
}
