import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTimeFormat } from '../hooks/useTimeFormat';
import { useTheme } from '../contexts/theme-context';
import { BlurSheet } from './blur-sheet';
import { SheetPanel } from './sheet-panel';
import { AText, Eyebrow, LiveDot } from './amazen';
import { heroParts } from './home/shift-state';
import { readClockOut, type ClockOutShift } from './home/clock-out-state';
import { formatDistance } from '../lib/distance';

/**
 * CLOCK OUT — THE SHEET.
 *
 * A shift ends in a record, so this is set like one: the day drawn to scale,
 * the times as a receipt, and one jade button.
 *
 * ⚠️ NOTHING HERE MAY EVER BLOCK CLOCKING OUT — rule 1, and it was broken.
 * `canConfirm = notes.trim().length > 0` disabled both the button and the
 * submit handler, so **a member could not end their shift without typing a
 * sentence** — against a type whose own field is `notes?: string`, optional,
 * beside an `earlyReason` documented as "never refuses the clock-out for want
 * of a reason". Somebody standing in the rain at 15:00 was being asked to
 * write an essay before the clock would stop.
 *
 * ⚠️ AND THE PRIMARY WAS AMBER (`#d97706`). Amber is the `warn` token — it
 * means a variance from the roster. Clocking out is the correct end of a
 * shift, pressed every day by everybody; it is the primary, in jade. Amber
 * appears on this sheet only where something actually differs from the plan.
 *
 * ❌ NO TITLE AND NO QUESTION. "Clock Out / Are you sure you want to clock
 * out?" spent the top of the sheet restating the button, and made a daily act
 * sound risky. The eyebrow says where you are, the hero says what you did, the
 * button says what happens — the receipt IS the confirmation.
 *
 * ❌ AND NOT "What did you do today?". A shift is not a day: a night shift
 * clocks out on the wrong side of midnight, and the question then asks about
 * yesterday. The note is collapsed and marked optional.
 *
 * ⚠️ THE CLOCK-OUT TIME IS FROZEN AT OPEN — rule 4. A sheet left sitting on a
 * table must not silently bill more minutes than the receipt showed.
 */
export interface ClockOutSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * ⚠️ THREE FIELDS, NOT ONE. `earlyReason` and `overtimeReason` are their own
   * columns and mean different things to an approver; writing either into
   * `notes` (rule 6) buries a reason in free text nothing can read.
   */
  onConfirm: (input: { notes?: string; earlyReason?: string; overtimeReason?: string }) => void;
  isLoading?: boolean;
  /** Everything the sheet shows. ⚠️ Nothing new is fetched — §11.4. */
  shift: ClockOutShift;
}

/** ② — the reasons, as KEYS. The label is looked up where it is rendered. */
const EARLY_REASONS = ['finished', 'sentHome', 'unwell', 'other'] as const;

export function ClockOutSheet({ visible, onClose, onConfirm, isLoading = false, shift }: ClockOutSheetProps) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  /*
    ⚠️ THE SAME CLOCK AS THE CARD THIS CAME OUT OF. The receipt is what the
    member signs off; if the sheet renders `15:00` where the card said
    `3:00 PM`, the two disagree about the shift in the one place it is being
    confirmed. `useTimeFormat` reads the member's own 12h/24h choice and the
    organization's timezone, so neither surface decides for itself.
  */
  const clockOf = useTimeFormat().formatTime;

  const [notes, setNotes] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [earlyReason, setEarlyReason] = useState<string | null>(null);

  const view = useMemo(() => readClockOut(shift), [shift]);
  const late = view.face === 'late';
  const early = view.face === 'early';

  const close = useCallback(() => {
    setNotes(''); setNoteOpen(false); setEarlyReason(null);
    onClose();
  }, [onClose]);

  const confirm = useCallback(() => {
    if (isLoading) return;
    const body = {
      notes: notes.trim() || undefined,
      /*
        ⚠️ PICKING NONE STILL CLOCKS OUT. The chips are an offer, not a
        question — a member who does not want to say why is clocking out, and
        the reason column stays null.
      */
      earlyReason: early && earlyReason ? t(`shiftEnd.reasons.${earlyReason}`, { defaultValue: earlyReason }) : undefined,
      /*
        ⚠️ ③ ASKS FOR THE EXTRA TIME, AND THE CLOCK-OUT HAPPENS EITHER WAY.
        The reason is the request; its absence is not a refusal to clock out.
      */
      overtimeReason: late
        ? t('shiftEnd.overtimeReason', {
            duration: dur(view.overBy),
            defaultValue: `${dur(view.overBy)} past the rostered end`,
          })
        : undefined,
    };
    setNotes(''); setNoteOpen(false); setEarlyReason(null);
    onConfirm(body);
  }, [isLoading, notes, early, earlyReason, late, view.overBy, onConfirm, t]);

  const eyebrow = late
    ? t('shiftEnd.pastEnd', { defaultValue: 'PAST YOUR SHIFT END' })
    : early
      ? t('shiftEnd.finishingEarly', { at: shift.workspace ?? '', defaultValue: `FINISHING EARLY AT ${shift.workspace ?? ''}` })
      : t('shiftEnd.finishingAt', { at: shift.workspace ?? '', defaultValue: `FINISHING AT ${shift.workspace ?? ''}` });

  return (
    <BlurSheet visible={visible} onClose={close}>
      {/*
        ⚠️ THE SAME PANEL AS EVERY OTHER SHEET. It used to roll its own glass
        surface, and glass is see-through: the card's buttons showed through
        the receipt (06.png) while the Report sheet beside it was solid. One
        surface, one component.
      */}
      <SheetPanel onClose={close}>
        {/* The eyebrow says WHERE. You have not left the card; it has opened. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1) }}>
          <LiveDot color={late || early ? c.warn : c.accent} live={false} />
          <Eyebrow tone={late || early ? 'warn' : 'muted'}>{eyebrow}</Eyebrow>
        </View>

        {/*
          The hero says WHAT YOU DID — ⚠️ the same figure in the same setting as
          the card it came from, so the number they were watching is the number
          they are signing off.
        */}
        <View style={{ marginTop: amazen.space(3) }}>
          <Hero minutes={shift.countedMinutes} warn={late || early} />
          <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {t('shiftEnd.counted', { defaultValue: 'counted' })}
          </AText>
        </View>

        <Bar view={view} shift={shift} clockOf={clockOf} />

        {/* ④ — recorded, never refused. */}
        {view.away ? (
          <Strip tone="warn">
            {t('shiftEnd.away', {
              distance: formatDistance(view.away.metres),
              at: shift.workspace ?? '',
              who: shift.approver ?? t('shiftEnd.yourApprover', { defaultValue: 'your approver' }),
              defaultValue: `You are ${formatDistance(view.away.metres)} from ${shift.workspace ?? ''}. The clock-out works — ${shift.approver ?? 'your approver'} will see where it happened.`,
            })}
          </Strip>
        ) : null}

        <Receipt view={view} shift={shift} clockOf={clockOf} />

        {/*
          ② — the chips. ⚠️ `WHY, IF YOU WANT TO SAY · OPTIONAL` says the whole
          contract in the label: it is an offer, and picking none still clocks
          out.
        */}
        {early ? (
          <>
            <Eyebrow tone="muted" style={{ marginTop: amazen.space(4) }}>
              {t('shiftEnd.whyOptional', { defaultValue: 'WHY, IF YOU WANT TO SAY · OPTIONAL' })}
            </Eyebrow>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2), marginTop: amazen.space(2) }}>
              {EARLY_REASONS.map((k) => {
                const on = earlyReason === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setEarlyReason(on ? null : k)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => ({
                      paddingVertical: amazen.space(2),
                      paddingHorizontal: amazen.space(3.5),
                      borderRadius: amazen.radius.full,
                      backgroundColor: c.tile,
                      borderWidth: 1.5,
                      borderColor: on ? c.inkStrong : 'transparent',
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <AText variant="caption" tone={on ? 'strong' : 'muted'}>
                      {t(`shiftEnd.reasons.${k}`, { defaultValue: k })}
                    </AText>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ③ — what the button is about to ask for. */}
        {late ? (
          <Strip tone="warn">
            {t('shiftEnd.askApproval', {
              who: shift.approver ?? t('shiftEnd.yourApprover', { defaultValue: 'your approver' }),
              duration: dur(view.overBy),
              defaultValue: `This asks ${shift.approver ?? 'your approver'} to approve ${dur(view.overBy)} of extra time. You are clocked out either way.`,
            })}
          </Strip>
        ) : null}

        {/*
          ⚠️ COLLAPSED, AND MARKED OPTIONAL. A 500-character box with a counter
          is a wall of blank at the moment somebody wants to go home.
        */}
        {noteOpen ? (
          <TextInput
            value={notes}
            onChangeText={setNotes}
            autoFocus
            multiline
            maxLength={500}
            placeholder={t('shiftEnd.addNote', { defaultValue: 'Add a note' })}
            placeholderTextColor={c.inkMuted}
            style={{
              marginTop: amazen.space(4),
              backgroundColor: c.sunken,
              borderRadius: amazen.radius.field,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.lineField,
              paddingHorizontal: amazen.space(4),
              paddingVertical: amazen.space(3),
              color: c.inkStrong,
              fontFamily: amazen.font.sans,
              fontSize: 15,
              height: 88,
              textAlignVertical: 'top',
            }}
          />
        ) : (
          <Pressable
            onPress={() => setNoteOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center',
              marginTop: amazen.space(4),
              backgroundColor: c.tile,
              borderRadius: amazen.radius.field,
              paddingVertical: amazen.space(3),
              paddingHorizontal: amazen.space(4),
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <AText variant="caption" tone="ink">
              {`＋  ${t('shiftEnd.addNote', { defaultValue: 'Add a note' })}`}
            </AText>
            <View style={{ flex: 1 }} />
            <AText variant="caption" tone="muted">
              {t('shiftEnd.optional', { defaultValue: 'optional' })}
            </AText>
          </Pressable>
        )}

        {/*
          ⚠️ ONE JADE BUTTON, AND NOTHING DISABLES IT — rule 1. `disabled` here
          is only "a request is already in flight", never "you have not filled
          something in".
        */}
        <Pressable
          onPress={confirm}
          disabled={isLoading}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: amazen.space(5),
            paddingVertical: amazen.space(3.5),
            alignItems: 'center',
            borderRadius: amazen.radius.full,
            backgroundColor: c.accentSolid,
            opacity: isLoading ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
            {late
              ? t('shiftEnd.clockOutAndAsk', { defaultValue: 'Clock out & ask' })
              : t('home.fullTime.clockOut')}
          </AText>
        </Pressable>

        {/*
          ⚠️ CANCEL IS A TEXT LINE, NOT A SECOND BUTTON. You almost never cancel
          this — it must not weigh the same as confirming.
        */}
        <Pressable onPress={close} accessibilityRole="button" hitSlop={10} style={{ alignSelf: 'center', marginTop: amazen.space(3) }}>
          <AText variant="caption" tone="muted">
            {t('shiftEnd.notYet', { defaultValue: 'Not yet' })}
          </AText>
        </Pressable>
      </SheetPanel>
    </BlurSheet>
  );
}

/** `8` `h` `12` `m` — the card's own helper, so the two can never drift. */
function Hero({ minutes, warn }: { minutes: number; warn: boolean }) {
  const { amazen } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      {heroParts(minutes).map((p, i) => (
        <React.Fragment key={i}>
          <AText
            variant="displaySm"
            tone={warn ? 'warn' : 'strong'}
            numeric
            style={i > 0 ? { marginLeft: amazen.space(2) } : undefined}
          >
            {p.value}
          </AText>
          <AText variant="decimal" tone={warn ? 'warn' : 'muted'} numeric>{p.unit}</AText>
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * THE DAY, TO SCALE.
 *
 * ⚠️ SEGMENTS AS FLEX WEIGHTS, so it is always to scale whatever the shift
 * was. Jade is worked, the notch is the rest, hatched amber is over, empty
 * track is the shortfall — you see the SHAPE of the shift before you read a
 * figure.
 */
function Bar({ view, shift, clockOf }: { view: ReturnType<typeof readClockOut>; shift: ClockOutShift; clockOf: (d: Date) => string }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const { worked, rest, over, short } = view.bar;

  return (
    <View style={{ marginTop: amazen.space(4) }}>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.tile }}>
        <View style={{ flex: worked, backgroundColor: c.accent }} />
        {rest > 0 ? <View style={{ flex: rest, backgroundColor: c.sunken }} /> : null}
        {over > 0 ? <Hatch flex={over} /> : null}
        {short > 0 ? <View style={{ flex: short, backgroundColor: c.tile }} /> : null}
      </View>

      <View style={{ flexDirection: 'row', marginTop: amazen.space(1.5) }}>
        <AText variant="caption" tone="muted" numeric style={{ fontSize: 11.5 }}>
          {clockOf(shift.clockInAt)}
        </AText>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'flex-end' }}>
          <AText variant="caption" tone="muted" numeric style={{ fontSize: 11.5 }}>
            {clockOf(shift.clockOutAt)}
          </AText>
          {view.overBy > 0 ? (
            <AText variant="caption" tone="warn" numeric style={{ fontSize: 11 }}>
              {t('shiftEnd.over', { duration: dur(view.overBy), defaultValue: `${dur(view.overBy)} over` })}
            </AText>
          ) : view.shortBy > 0 ? (
            <AText variant="caption" tone="muted" numeric style={{ fontSize: 11 }}>
              {dur(view.shortBy)}
            </AText>
          ) : null}
        </View>
      </View>

      {rest > 0 ? (
        <AText variant="caption" tone="muted" style={{ textAlign: 'center', fontSize: 11, marginTop: 2 }}>
          {t('shiftEnd.restNotch', { duration: dur(rest), defaultValue: `${dur(rest)} rest` })}
        </AText>
      ) : null}
    </View>
  );
}

/**
 * Amber hatching.
 *
 * ⚠️ DRAWN, NOT A GRADIENT. React Native has no repeating-linear-gradient and
 * `expo-linear-gradient` cannot repeat, so a CSS-shaped answer here would be a
 * flat amber block that says "over" without looking unlike the rest of the bar.
 * Skewed bars at 135° read as hatching at 12pt tall, which is all this has to
 * do.
 */
function Hatch({ flex }: { flex: number }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flex, backgroundColor: c.warnTint, overflow: 'hidden', flexDirection: 'row' }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 3, height: 26, marginRight: 4, marginTop: -7,
            backgroundColor: c.warn, opacity: 0.55,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
    </View>
  );
}

/**
 * THE RECEIPT.
 *
 * ⚠️ MONO, RIGHT-ALIGNED, ONE RULE ABOVE THE TOTAL. A shift ends in a record;
 * setting it like a statement is what makes it feel finished, and it is why
 * the figures line up as digits rather than as prose.
 */
function Receipt({ view, shift, clockOf }: { view: ReturnType<typeof readClockOut>; shift: ClockOutShift; clockOf: (d: Date) => string }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;

  return (
    <View
      style={{
        marginTop: amazen.space(4),
        backgroundColor: c.sunken,
        borderRadius: 20,
        paddingHorizontal: amazen.space(4),
        paddingVertical: amazen.space(3),
      }}
    >
      <Row label={t('shiftEnd.clockedIn', { defaultValue: 'Clocked in' })} value={clockOf(shift.clockInAt)} />
      {view.bar.rest > 0 ? (
        <Row label={t('shiftEnd.rest', { defaultValue: 'Rest' })} value={`− ${dur(view.bar.rest)}`} />
      ) : null}

      {view.face === 'late' ? (
        <>
          <Row
            label={t('shiftEnd.shiftEnded', { defaultValue: 'Shift ended' })}
            value={shift.shiftEndAt ? clockOf(shift.shiftEndAt) : '—'}
          />
          <Row
            label={t('shiftEnd.stillWorkingUntil', { defaultValue: 'Still working until' })}
            value={clockOf(shift.clockOutAt)}
            tone="warn"
          />
        </>
      ) : (
        <Row
          label={t('shiftEnd.clockedOut', { defaultValue: 'Clocked out' })}
          value={clockOf(shift.clockOutAt)}
          /* ④ — the row carries the flag; the button is untouched. */
          flag={view.away ? `⚑ ${formatDistance(view.away.metres)}` : null}
        />
      )}

      {view.shortBy > 0 ? (
        <Row
          label={t('shiftEnd.short', { defaultValue: 'Short of your shift' })}
          value={dur(view.shortBy)}
          tone="warn"
        />
      ) : null}

      <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.lineWell, marginVertical: amazen.space(2.5) }} />

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/*
          ⚠️ TWO STRINGS, NOT ONE. The hero's sub-label is lowercase `counted`
          — it finishes the sentence the figure started. The receipt's total is
          a row LABEL and takes a capital like every other row in it. Sharing
          one key put a lowercase word in a column of capitalised ones.
        */}
        <AText variant="body" tone="ink" style={{ fontSize: 14.5 }}>
          {t('shiftEnd.countedTotal', { defaultValue: 'Counted' })}
        </AText>
        <View style={{ flex: 1 }} />
        <AText variant="body" tone="strong" numeric style={{ fontSize: 16 }}>
          {dur(shift.countedMinutes)}
        </AText>
      </View>
    </View>
  );
}

function Row({
  label, value, tone = 'muted', flag,
}: { label: string; value: string; tone?: 'muted' | 'warn'; flag?: string | null }) {
  const { amazen } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: amazen.space(1.5) }}>
      <AText variant="caption" tone="muted" style={{ fontSize: 13.5 }}>{label}</AText>
      <View style={{ flex: 1 }} />
      {flag ? (
        <AText variant="caption" tone="warn" numeric style={{ fontSize: 12, marginRight: amazen.space(2) }}>{flag}</AText>
      ) : null}
      <AText variant="caption" tone={tone === 'warn' ? 'warn' : 'ink'} numeric style={{ fontSize: 13.5 }}>{value}</AText>
    </View>
  );
}

/** A `warn_tint` strip — a fact about a variance, never an error. */
function Strip({ children, tone }: { children: React.ReactNode; tone: 'warn' }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View
      style={{
        marginTop: amazen.space(4),
        backgroundColor: c.warnTint,
        borderRadius: amazen.radius.field,
        paddingVertical: amazen.space(3),
        paddingHorizontal: amazen.space(4),
      }}
    >
      <AText variant="caption" tone={tone}>{children}</AText>
    </View>
  );
}

/** `1h 08m` / `32m`. Never the word "paid". */
function dur(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
