import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { AText, SheetOption } from '../../amazen';
import { NavigateGlyph } from '../../glyphs';
import { inkGlyph } from '../../amazen/ink-icon';
import { EditGlyph, IssueGlyph } from '../job-glyphs';
import { JobSheet } from '../job-ui';
import type { MoreOption } from '../job-logic';

const ChatInk = inkGlyph('chat');

/**
 * ⋯ on a job — every onward step that is not the primary, Report an issue and
 * Decline (both red ink, both one step removed from the thumb), Open in maps,
 * and for somebody overseeing: Assign, Edit, Cancel. `moreOptions()` decides
 * what is here; this only draws it.
 */
export function MoreSheet({
  visible,
  onClose,
  title,
  options,
  labelOf,
  assigned,
  onPick,
  onChat,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: MoreOption[];
  labelOf: (key: string) => string;
  assigned: boolean;
  onPick: (o: MoreOption) => void;
  /** The job's chat — the crew and the office (opened, or created, online). Absent without chat. */
  onChat?: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  return (
    <JobSheet visible={visible} onClose={onClose}>
      <AText variant="h3" tone="strong" numberOfLines={2} style={{ fontSize: 16, lineHeight: 22 }}>{title}</AText>
      {onChat ? (
        <SheetOption
          key="chat"
          Glyph={ChatInk}
          label={t('chat.jobChatOpen', 'Job chat')}
          hint={t('chat.jobChatHint', 'The crew and the office')}
          onPress={onChat}
        />
      ) : null}
      {options.map((o) => {
        switch (o.kind) {
          case 'step': return <SheetOption key={`step:${o.to}`} label={labelOf(o.to)} onPress={() => onPick(o)} />;
          case 'issue':
            return (
              <SheetOption
                key="issue"
                Glyph={IssueGlyph}
                tone="critical"
                label={t('job.more.issue')}
                hint={t('job.more.issueHint')}
                onPress={() => onPick(o)}
              />
            );
          case 'decline':
            return (
              <SheetOption
                key="decline"
                tone="critical"
                label={t('job.more.decline')}
                hint={t('job.more.declineHint')}
                onPress={() => onPick(o)}
              />
            );
          case 'maps': return <SheetOption key="maps" Glyph={NavigateGlyph} label={t('job.more.maps')} onPress={() => onPick(o)} />;
          case 'assign':
            return (
              <SheetOption
                key="assign"
                label={assigned ? t('job.dock.reassign') : t('job.dock.assign')}
                onPress={() => onPick(o)}
              />
            );
          case 'edit': return <SheetOption key="edit" Glyph={EditGlyph} label={t('job.more.edit')} onPress={() => onPick(o)} />;
          case 'cancel': return <SheetOption key="cancel" tone="critical" label={t('job.more.cancel')} onPress={() => onPick(o)} />;
          default: return null;
        }
      })}
      {options.length === 0 && !onChat ? (
        <AText variant="caption" tone="ink" style={{ marginBottom: amazen.space(2) }}>
          {t('job.more.nothing')}
        </AText>
      ) : null}
    </JobSheet>
  );
}
