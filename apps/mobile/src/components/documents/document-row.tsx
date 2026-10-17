import React, { memo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCalendarDate } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import type { MemberDocument } from '../../lib/api';
import { documentTypeIcon } from '../../lib/document-icons';
import { AText } from '../amazen';
import { Pill } from '../job/job-ui';

const MONTH_KEYS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

/** A day as the document prints it, from a stored date or timestamp. */
export const dayOf = (iso: string) => formatCalendarDate(iso.slice(0, 10));

/**
 * What a document's row says about it, in one word or two — or nothing.
 *
 * A tag only when there is something to know: sent for review, sent back, the
 * validity of a credential, signed. A payslip is just a payslip.
 * ⚠️ "Sent for review" and "sent back" were fetched and never shown, so a
 * member had no way to tell whether the licence they sent had been accepted.
 */
export function useDocumentTag() {
  const { t } = useTranslation();
  return (d: MemberDocument): { label: string; tone: 'accent' | 'warn' | 'critical' | 'neutral' } | null => {
    if (d.needsSignature) return { label: t('documents.tag.sign', 'Sign'), tone: 'warn' };
    if (d.status === 'PENDING_VERIFICATION') return { label: t('documents.status.pendingVerification'), tone: 'neutral' };
    if (d.status === 'REJECTED') return { label: t('documents.tag.sentBack', 'Sent back'), tone: 'critical' };
    if (d.standing === 'EXPIRED')
      return {
        label: d.expiresOn
          ? t('documents.tag.expiredOn', { date: dayOf(d.expiresOn), defaultValue: 'Expired {{date}}' })
          : t('documents.standing.expired'),
        tone: 'critical',
      };
    if (d.standing === 'EXPIRING')
      return {
        label: d.expiresOn
          ? t('documents.tag.expiresOn', { date: dayOf(d.expiresOn), defaultValue: 'Expires {{date}}' })
          : t('documents.standing.expiring'),
        tone: 'warn',
      };
    if (d.standing === 'VALID' && d.expiresOn)
      return {
        label: t('documents.tag.validTo', { date: dayOf(d.expiresOn), defaultValue: 'Valid to {{date}}' }),
        tone: 'accent',
      };
    if (d.status === 'SIGNED') return { label: t('documents.tag.signed', 'Signed'), tone: 'accent' };
    return null;
  };
}

/** The month, the year, or the day it came — whichever the document is about. */
export function usePeriod() {
  const { t } = useTranslation();
  return (d: MemberDocument) => (
    d.periodMonth && d.periodYear ? t(`documents.months.${MONTH_KEYS[d.periodMonth - 1]}`)
      : d.periodYear ? String(d.periodYear)
      : dayOf(d.issuedAt)
  );
}

/**
 * One document, as a slice of the well it sits in (`first` drops the divider).
 * Unread: a jade dot on the mark and a brighter title. A wet-ink document says
 * so — the app cannot clear it, and a member who is not told never learns they
 * must sign a printed copy.
 */
export const DocumentRow = memo(function DocumentRow({
  doc, first, onPaper, busy, onPress,
}: {
  doc: MemberDocument;
  first: boolean;
  onPaper: boolean;
  busy: boolean;
  onPress: (d: MemberDocument) => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const tagOf = useDocumentTag();
  const periodOf = usePeriod();
  const tag = tagOf(doc);
  const period = periodOf(doc);
  const meta = [doc.typeLabel, doc.forMember ? t('documents.onBehalfOf', { name: doc.forMember }) : null].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() => onPress(doc)}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${doc.title}, ${period}`}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.75),
        borderTopWidth: first ? 0 : 1, borderTopColor: c.lineWell, opacity: pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: doc.needsSignature ? c.accentTint : c.tile,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Ionicons name={documentTypeIcon(doc.typeKey)} size={18} color={doc.needsSignature ? c.accent : c.ink} />
        {doc.unread ? (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: c.accent,
              borderWidth: 2,
              borderColor: c.well,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AText
          variant="body"
          numberOfLines={1}
          style={{
            fontSize: 14.5,
            color: c.inkStrong,
            fontFamily: doc.unread ? amazen.font.sansMedium : amazen.font.sans,
          }}
        >
          {doc.title}
        </AText>
        <AText variant="caption" tone="muted" numberOfLines={1}>{meta}</AText>
        {tag || onPaper ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
            {tag ? <Pill label={tag.label} tone={tag.tone} /> : null}
            {onPaper ? <Pill label={t('documents.signOnPaper')} tone="neutral" /> : null}
          </View>
        ) : null}
      </View>
      {busy
        ? <ActivityIndicator size="small" color={c.accent} />
        : <AText variant="caption" tone="muted" numeric>{`${period} ›`}</AText>}
    </Pressable>
  );
});
