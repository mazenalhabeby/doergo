import { Image, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { type ShiftIssueEvent } from '../../lib/api/shift-issues';
import { AText } from '../../components/amazen';
import { type ThreadEntry } from '../home/issue-status';

/** ShiftIssueThreadSheet's module-level helpers, moved here unchanged so its sections can read them too. */
/**
 * ⚠️ THE TWO ENDINGS DO NOT SHARE A LIST. "Fixed on site" is not a reason to
 * withdraw something, and "Duplicate" is not a repair — one list would put
 * every wrong answer in front of both people. The web's six split four / two
 * along exactly that line.
 *
 * ⚠️ AND THEY ARE THE WEB'S OWN KEYS (`issues.resolveReasons`), already
 * written in five languages. A second list of the same six sentences is how
 * the phone and the desk end up disagreeing about what "Duplicate" means.
 */
export const ENDING_REASONS = {
  resolve: ['fixedOnSite', 'partsUnavailable', 'needsSpecialist', 'customerUnavailable'],
  withdraw: ['duplicate', 'notAnIssue'],
} as const;

/**
 * SOMETHING HAPPENED — a centred line, and the reason under it when there is one.
 *
 * ⚠️ IT IS NOT A BUBBLE AND MUST NOT LOOK LIKE ONE. A system event styled as a
 * message from somebody is the read-receipt mistake in another shape: it
 * invites a reply to a sentence nobody wrote.
 */
export function Note({ entry }: { entry: Extract<ThreadEntry, { kind: 'note' }> }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const clockOf = useTimeFormat().formatTime;
  const when = new Date(entry.event.at);
  const time = Number.isNaN(when.getTime()) ? '' : clockOf(when);
  const line = t(entry.key, {
    name: entry.who,
    defaultValue: entry.who ? `${entry.who} updated this` : 'This was updated',
  });

  return (
    <View style={{ alignItems: 'center', marginBottom: amazen.space(3) }}>
      <View
        style={{
          maxWidth: '92%',
          alignItems: 'center',
          backgroundColor: c.tile,
          borderRadius: amazen.radius.full,
          paddingHorizontal: amazen.space(3),
          paddingVertical: amazen.space(1.5),
        }}
      >
        <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          {`${line}${time ? ` · ${time}` : ''}`}
        </AText>
      </View>
      {/* ⚠️ Its own line — see `readThread`. */}
      {entry.reason ? (
        <AText variant="caption" tone="ink" style={{ marginTop: 4, maxWidth: '86%', textAlign: 'center' }}>
          {entry.reason}
        </AText>
      ) : null}
    </View>
  );
}

/** Yours on the right in accent-tint; theirs on the left on a sunken surface. */
export function Bubble({ event, mine, onOpenPhoto }: { event: ShiftIssueEvent; mine: boolean; onOpenPhoto: (uri: string) => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  /* The same clock as the card and the receipt — see `useTimeFormat`. */
  const clockOf = useTimeFormat().formatTime;
  const when = new Date(event.at);
  const time = Number.isNaN(when.getTime()) ? '' : clockOf(when);

  if (!event.body && !(event.attachments?.length)) return null;

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: amazen.space(3) }}>
      <View
        style={{
          maxWidth: '82%',
          backgroundColor: mine ? c.accentTint : c.sunken,
          borderRadius: amazen.radius.field,
          padding: amazen.space(3),
          gap: amazen.space(2),
        }}
      >
        {/*
          ⚠️ A PDF IS NOT AN IMAGE. Every attachment was drawn through
          `<Image>`, so a document arrived as a 180×135 blank — the member is
          told a file is there and shown nothing. And a photo opens full
          screen: a thumbnail of a cracked weld is not evidence of anything.
        */}
        {event.attachments?.map((a) => {
          const uri = a.url ?? a.fileUrl;
          return (a.mimeType ?? '').startsWith('image/') ? (
            <Pressable
              key={a.id ?? a.fileUrl}
              onPress={() => onOpenPhoto(uri)}
              accessibilityRole="imagebutton"
              accessibilityLabel={a.fileName}
            >
              <Image source={{ uri }} style={{ width: 180, height: 135, borderRadius: amazen.radius.tile }} />
            </Pressable>
          ) : (
            <View
              key={a.id ?? a.fileUrl}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: amazen.space(2),
                backgroundColor: c.tile, borderRadius: amazen.radius.tile,
                paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(2),
              }}
            >
              <AText variant="caption" tone="muted">▤</AText>
              <AText variant="caption" tone="ink" numberOfLines={1} style={{ flex: 1 }}>{a.fileName}</AText>
            </View>
          );
        })}
        {event.body ? <AText variant="body" tone="ink">{event.body}</AText> : null}
      </View>
      <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>
        {`${event.actorName ?? ''} · ${time}`.trim()}
      </AText>
    </View>
  );
}
