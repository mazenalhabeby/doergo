import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  REQUEST_LIMITS,
  detectRequest,
  formatDuration,
  localDateKey,
  type DetectedRequest,
  type RequestKind,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText, FilterPill, FilterRow, PrimaryButton, Well } from '../amazen';
import { JobField, QuietButton, SectionLabel } from '../job/job-ui';
import { DaySheet, TimeSheet } from '../new-job/when-sheets';
import type { RequestOptions } from '../../lib/api/technicians';
import { RequestKindGlyph } from './request-glyphs';
import { PrecheckCard } from './precheck-card';
import { SuggestionCard } from './suggestion-card';
import { useRequestPrecheck } from './use-request-precheck';
import { OVERTIME_PRESETS, draftToBody, kindEffectKey, kindLabelKey, stepOvertime, type RequestBody } from './request-model';
import { useRequestFormCard } from './use-request-form-card';
import { Stepper } from './request-form-card-helpers';

/**
 * A REQUEST THAT IS NOT LEAVE — remote work, a changed day, overtime agreed in
 * advance, or anything else in words. Leave keeps its own flow on the calendar.
 *
 * ⚠️ A CARD ON THE PAGE, NOT A SHEET. Its day and time pickers are sheets, and
 * the app has exactly one modal slot (`blur-sheet.tsx`): a picker asked for
 * from inside a sheet waits for that sheet to close, so it would never open.
 *
 * Each kind shows only its own fields, and the body is validated by the SAME
 * function the server runs (`draftToBody` → `parseRequestInput`), so the Send
 * button is never offered for something the server would refuse as malformed.
 */
export function RequestFormCard({
  kind,
  options,
  busy,
  onClose,
  onSubmit,
  initial,
  onSuggest,
}: {
  /** Filled in from a suggestion ("This looks like…"); the member still checks and sends. */
  initial?: { start?: string; end?: string; startTime?: string; endTime?: string; minutes?: number; reason?: string } | null;
  /** "Other" words that read as another kind: the screen switches to it. */
  onSuggest?: (s: DetectedRequest, words: string) => void;
  /** LEAVE never opens here. */
  kind: Exclude<RequestKind, 'LEAVE'>;
  options: RequestOptions | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: RequestBody) => void;
}) {
  const {
    amazen,
    c,
    t,
    today,
    start,
    setStart,
    end,
    setEnd,
    spaceId,
    setSpaceId,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    minutes,
    setMinutes,
    reason,
    setReason,
    picker,
    setPicker,
    tried,
    spaces,
    range,
    built,
    noSpace,
    precheck,
    suggestion,
    effect,
    dayLabel,
    send,
  } = useRequestFormCard({ kind, options, busy, onClose, onSubmit, initial, onSuggest });

  return (
    <Well style={{ padding: amazen.space(4), gap: amazen.space(3.5) }}>
      <View style={{ gap: amazen.space(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <RequestKindGlyph kind={kind} size={18} color={c.accent} contrast={c.well} />
          <SectionLabel tone="accent">{t('requests.new', 'New request')}</SectionLabel>
        </View>
        <AText variant="h2" tone="strong" style={{ fontFamily: amazen.font.sansLight }}>{t(kindLabelKey(kind))}</AText>
      </View>
      <View style={{ gap: amazen.space(1.5) }}>
        <SectionLabel>{range ? t('requests.form.days', 'Days') : t('requests.form.day', 'Day')}</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          {range ? <AText variant="caption" tone="muted" style={{ width: 44 }}>{t('time.off.from', 'From')}</AText> : null}
          <FilterRow><FilterPill label={dayLabel(start)} on onPress={() => setPicker('start')} /></FilterRow>
        </View>
        {range ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            <AText variant="caption" tone="muted" style={{ width: 44 }}>{t('time.off.to', 'To')}</AText>
            <FilterRow>
              <FilterPill
                label={end ? dayLabel(end) : t('requests.form.sameDay', 'Same day')}
                on={!!end}
                onPress={() => setPicker('end')}
              />
            </FilterRow>
          </View>
        ) : null}
      </View>

      {kind === 'REMOTE' ? (
        <View style={{ gap: amazen.space(1.5) }}>
          <SectionLabel>{t('requests.form.workspace', 'Workspace')}</SectionLabel>
          {noSpace ? (
            <AText variant="caption" tone="warn" style={{ fontSize: 13 }}>
              {t('requests.noRemoteSpace', 'There is no workspace you may work remotely for.')}
            </AText>
          ) : (
            <FilterRow>
              {spaces.map((s) => (
                <FilterPill key={s.id} label={s.name} on={spaceId === s.id} onPress={() => setSpaceId(s.id)} />
              ))}
            </FilterRow>
          )}
        </View>
      ) : null}

      {kind === 'HOURS' ? (
        <View style={{ gap: amazen.space(1.5) }}>
          <SectionLabel>{t('requests.form.newHours', 'New hours')}</SectionLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            <AText variant="caption" tone="muted" style={{ width: 44 }}>{t('requests.form.start', 'Start')}</AText>
            <FilterRow>
              <FilterPill
                label={startTime || t('requests.form.unchanged', 'Unchanged')}
                on={!!startTime}
                onPress={() => setPicker('startTime')}
              />
            </FilterRow>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            <AText variant="caption" tone="muted" style={{ width: 44 }}>{t('requests.form.end', 'End')}</AText>
            <FilterRow>
              <FilterPill
                label={endTime || t('requests.form.unchanged', 'Unchanged')}
                on={!!endTime}
                onPress={() => setPicker('endTime')}
              />
            </FilterRow>
          </View>
        </View>
      ) : null}

      {kind === 'OVERTIME' ? (
        <View style={{ gap: amazen.space(2) }}>
          <SectionLabel>{t('requests.form.howLong', 'How long')}</SectionLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            <Stepper sign="−" label={t('requests.form.less', '15 minutes less')} onPress={() => setMinutes((m) => stepOvertime(m, -1))} />
            <AText
              numeric
              accessibilityLiveRegion="polite"
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: amazen.font.mono,
                fontSize: 40,
                lineHeight: 48,
                color: c.inkStrong,
              }}>
              {`+${formatDuration(minutes)}`}
            </AText>
            <Stepper sign="+" label={t('requests.form.more', '15 minutes more')} onPress={() => setMinutes((m) => stepOvertime(m, 1))} />
          </View>
          <FilterRow>
            {OVERTIME_PRESETS.map((m) => <FilterPill key={m} label={formatDuration(m)} on={minutes === m} onPress={() => setMinutes(m)} />)}
          </FilterRow>
          <AText variant="caption" tone="muted" style={{ fontSize: 12 }}>
            {t('requests.form.overtimeRange', {
              defaultValue: 'Between {{min}} and {{max}}',
              min: formatDuration(REQUEST_LIMITS.OVERTIME_MIN_MINUTES),
              max: formatDuration(REQUEST_LIMITS.OVERTIME_MAX_MINUTES),
            })}
          </AText>
        </View>
      ) : null}

      <View style={{ gap: amazen.space(1.5) }}>
        <SectionLabel>
          {kind === 'OTHER'
            ? t('requests.form.reason', 'Reason')
            : t('requests.form.reasonOptional', 'Reason (optional)')}
        </SectionLabel>
        <JobField
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={REQUEST_LIMITS.REASON_MAX}
          placeholder={
            kind === 'OTHER'
              ? t('requests.form.otherPlaceholder', 'What are you asking for?')
              : t('requests.form.reasonPlaceholder', 'A short reason')
          }
        />
      </View>

      {effect ? (
        <View
          style={{
            borderRadius: 16,
            paddingVertical: amazen.space(2.5),
            paddingHorizontal: amazen.space(3),
            backgroundColor: c.accentTint,
          }}>
          <AText variant="caption" tone="accent" style={{ fontSize: 13, lineHeight: 18 }}>{t(effect)}</AText>
        </View>
      ) : null}

      {suggestion ? <SuggestionCard suggestion={suggestion} onUse={() => onSuggest?.(suggestion, reason)} /> : null}

      {built.ok ? <PrecheckCard precheck={precheck} kind={kind} /> : null}

      {tried && !built.ok ? (
        <AText variant="caption" tone="critical" style={{ fontSize: 13 }}>{t(`offline.errors.${built.code}`)}</AText>
      ) : null}

      <PrimaryButton label={t('time.off.send', 'Send the request')} onPress={send} disabled={busy || noSpace} loading={busy} />
      <QuietButton label={t('common.cancel', 'Cancel')} onPress={onClose} disabled={busy} />

      <DaySheet
        visible={picker === 'start'}
        value={new Date(`${start}T12:00:00`)}
        onPick={(d) => { const k = localDateKey(d); setStart(k); if (end && end < k) setEnd(null); }}
        onClear={() => setStart(today)}
        onClose={() => setPicker(null)}
      />
      <DaySheet
        visible={picker === 'end'}
        value={end ? new Date(`${end}T12:00:00`) : null}
        onPick={(d) => { const k = localDateKey(d); setEnd(k <= start ? null : k); }}
        onClear={() => setEnd(null)}
        onClose={() => setPicker(null)}
      />
      <TimeSheet
        visible={picker === 'startTime'}
        title={t('requests.form.startAt', 'Start at')}
        value={startTime}
        onPick={setStartTime}
        onClear={() => setStartTime('')}
        onClose={() => setPicker(null)}
      />
      <TimeSheet
        visible={picker === 'endTime'}
        title={t('requests.form.endAt', 'Finish at')}
        value={endTime}
        onPick={setEndTime}
        onClear={() => setEndTime('')}
        onClose={() => setPicker(null)}
      />
    </Well>
  );
}
