import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { STEP_FORM_LIMITS, type StepForm, type StepFormField } from '@hbcfield/shared/client';
import { useTheme } from '../../../contexts/theme-context';
import { useTimeFormat } from '../../../hooks/useTimeFormat';
import { useImagePicker } from '../../../hooks/useImagePicker';
import { AText, PrimaryButton, Well } from '../../amazen';
import { CameraGlyph, GalleryGlyph } from '../job-glyphs';
import { Banner, JobField, JobSheet, QuietButton } from '../job-ui';
import { SignPad, type SignPadHandle } from '../sign-pad';
import { monthGrid } from '../../new-job/new-job-logic';
import {
  dayOf, draftErrors, emptyDraft, errorKey, fieldLabel, formCounts, groupOf, isoDay, pageComplete, paginateForm, stillNeeded,
  type DraftPhoto, type FormDraft,
} from '../step-form-logic';

/**
 * "Ask when a job moves here" — the sheet the job page opens when a step's
 * form asks something. Drawn from the form's fields, in the form's order:
 * a note, a choice, photos, a signature, a name, a number, a yes/no, a date.
 *
 * ⚠️ ANY FORM, NOT ONE REPORT. This replaces the hard-coded Finish sheet: the
 * old field-service report arrives here as the `fieldService` preset (a
 * legacy report step), through the same code as a delivery or a sales visit.
 *
 * ⚠️ PAGES ARE DECIDED IN `paginateForm` (tested): a short form is one screen,
 * a long one goes answers → photos → sign-off. ALL PAGES STAY MOUNTED — "Back"
 * from the sign-off must not throw away a signature the customer already gave.
 *
 * ⚠️ THE SAME RULE AS THE SERVER. Next and Send open only when the shared
 * `validateStepAnswers` passes for the page; the server judges again, and a
 * refusal comes back as `serverErrors` on the fields it names.
 *
 * Field labels are the organization's own words — shown as written. Only the
 * field-service preset's fixed labels are translated (`fieldLabel`).
 */
export function StepFormSheet({
  visible,
  onClose,
  title,
  form,
  busy,
  serverErrors,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  /** The step the job is moving to, in the workflow's words — also the send button. */
  title: string;
  form: StepForm | null;
  busy: boolean;
  /** Field errors from the server's refusal, by field id (`*` = the whole form). */
  serverErrors: Record<string, string> | null;
  /** Sends. Resolves true when the move went through (or is kept to send). */
  onSubmit: (draft: FormDraft, signatures: Record<string, string>) => Promise<boolean>;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const fields = form?.fields ?? [];
  // Keyed by what the form IS, not by object identity — the page resolves it on every render.
  const formKey = form ? `${form.version}:${form.fields.map((f) => `${f.id}.${f.type}.${f.required ? 1 : 0}`).join(',')}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pages = useMemo(() => (form ? paginateForm(form) : []), [formKey]);
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<FormDraft>({});
  const [touching, setTouching] = useState(false);
  const [signing, setSigning] = useState(false);
  const pads = useRef<Record<string, SignPadHandle | null>>({});

  // A fresh sheet each time it opens, or when it is asked for another step.
  useEffect(() => {
    if (!visible || !form) return;
    setPage(0);
    setDraft(emptyDraft(form));
    pads.current = {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, formKey]);

  // A refusal points at a field: go to the page that holds it.
  useEffect(() => {
    if (!serverErrors) return;
    const i = pages.findIndex((p) => p.some((f) => serverErrors[f.id]));
    if (i >= 0) setPage(i);
  }, [serverErrors, pages]);

  if (!form) return <JobSheet visible={false} onClose={onClose}>{null}</JobSheet>;

  const set = (id: string, v: FormDraft[string]) => setDraft((d) => ({ ...d, [id]: v }));
  const current = pages[page] ?? [];
  const last = page >= pages.length - 1;
  const live = draftErrors(form, draft);
  const canGo = last ? pageComplete(form, draft, fields) : pageComplete(form, draft, current);
  const missing = stillNeeded(form, draft, last ? fields : current).map((f) => fieldLabel(f, t));
  const counts = formCounts(form);
  const label = (f: StepFormField) => fieldLabel(f, t);
  const pageName = (p: StepFormField[]) => (p.length === 1 ? label(p[0]!) : t(`job.form.page.${groupOf(p[0]!.type)}`));

  /* A field's error: the server's always; live ones only once there is something to be wrong about. */
  const errorFor = (f: StepFormField): string | null => {
    const server = serverErrors?.[f.id];
    if (server) return t(errorKey(server), errorParams(f));
    const mine = live[f.id];
    return mine && mine !== 'required' ? t(errorKey(mine), errorParams(f)) : null;
  };

  const send = async () => {
    setSigning(true);
    const signatures: Record<string, string> = {};
    try {
      for (const f of fields) {
        if (f.type !== 'signature' || draft[f.id] !== true) continue;
        const png = await pads.current[f.id]?.toPng();
        if (png) signatures[f.id] = png;
      }
    } finally {
      setSigning(false);
    }
    if (await onSubmit(draft, signatures)) onClose();
  };

  const general = serverErrors?.['*'] ? t(errorKey(serverErrors['*'])) : null;

  return (
    <JobSheet visible={visible} onClose={onClose} busy={busy || signing} scrollEnabled={!touching}>
      <View style={{ gap: amazen.space(1) }}>
        <AText variant="h2" tone="strong" numberOfLines={2} style={{ fontFamily: amazen.font.sansLight, flexShrink: 1 }}>{title}</AText>
        <AText variant="caption" tone="ink" numberOfLines={1}>{t('job.form.counts', { required: counts.required, total: counts.total })}</AText>
      </View>

      {pages.length > 1 ? (
        <View style={{ gap: amazen.space(1.5) }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {pages.map((_, i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= page ? c.accent : c.tile }} />
            ))}
          </View>
          <AText variant="caption" tone="ink" numberOfLines={1}>{t('job.finish.step', { index: page + 1, total: pages.length, name: pageName(current) })}</AText>
        </View>
      ) : null}

      {general ? <Banner tone="critical" text={general} /> : null}

      {pages.map((p, i) => (
        <View key={i} style={{ display: page === i ? 'flex' : 'none', gap: amazen.space(2.5) }}>
          {p.map((f) => (
            <FieldWell key={f.id} field={f} label={label(f)} error={errorFor(f)}>
              <FieldInput
                field={f}
                label={label(f)}
                value={draft[f.id]}
                onChange={(v) => set(f.id, v)}
                padRef={(h) => { pads.current[f.id] = h; }}
                onTouching={setTouching}
              />
            </FieldWell>
          ))}
        </View>
      ))}

      {last ? (
        <PrimaryButton label={title} onPress={() => void send()} disabled={!canGo || busy || signing} loading={busy || signing} />
      ) : (
        <PrimaryButton label={t('common.next')} onPress={() => setPage((x) => Math.min(pages.length - 1, x + 1))} disabled={!canGo} />
      )}
      {!canGo && missing.length ? (
        <AText variant="caption" tone="ink" numberOfLines={3} style={{ textAlign: 'center' }}>{t('job.finish.stillNeeded', { list: missing.join(', ') })}</AText>
      ) : null}
      {page > 0 ? <QuietButton label={t('common.back')} onPress={() => setPage((x) => Math.max(0, x - 1))} disabled={busy || signing} /> : null}
    </JobSheet>
  );
}

/** The numbers a sentence names — the limit a note or name may not pass. */
function errorParams(f: StepFormField): Record<string, unknown> {
  if (f.type === 'note') return { max: STEP_FORM_LIMITS.maxNoteLength };
  if (f.type === 'name') return { max: STEP_FORM_LIMITS.maxNameLength };
  if (f.type === 'photos') return { max: STEP_FORM_LIMITS.maxPhotos };
  return {};
}

/** A field in its well — `.pwell`: its label, Required / Optional, the input, and what is wrong with it. */
function FieldWell({ field, label, error, children }: { field: StepFormField; label: string; error: string | null; children: React.ReactNode }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  return (
    <Well style={{ paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(3.25), gap: amazen.space(2), backgroundColor: c.tile }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: amazen.space(2) }}>
        <AText
          numberOfLines={2}
          style={{ flex: 1, flexShrink: 1, color: c.inkMuted, fontFamily: amazen.font.mono, fontSize: 10.5, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase' }}
        >
          {label}
        </AText>
        <AText
          numberOfLines={1}
          style={{ flexShrink: 0, color: field.required ? c.accent : c.inkMuted, fontFamily: amazen.font.mono, fontSize: 10, lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase' }}
        >
          {field.required ? t('common.required') : t('common.optional')}
        </AText>
      </View>
      {children}
      {error ? <AText variant="caption" tone="critical" numberOfLines={3}>{error}</AText> : null}
    </Well>
  );
}

/** The one input a field type draws. */
function FieldInput({
  field,
  label,
  value,
  onChange,
  padRef,
  onTouching,
}: {
  field: StepFormField;
  label: string;
  value: FormDraft[string];
  onChange: (v: FormDraft[string]) => void;
  padRef: (h: SignPadHandle | null) => void;
  onTouching: (on: boolean) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const text = typeof value === 'string' ? value : '';

  switch (field.type) {
    case 'note': {
      const max = STEP_FORM_LIMITS.maxNoteLength;
      return (
        <View style={{ gap: amazen.space(1) }}>
          <JobField value={text} onChangeText={onChange} placeholder={t('job.form.typeHere')} multiline maxLength={max} accessibilityLabel={label} />
          {text.length >= max * 0.9 ? (
            <AText variant="caption" tone={text.length >= max ? 'warn' : 'muted'} numeric style={{ alignSelf: 'flex-end' }}>{`${text.length} / ${max}`}</AText>
          ) : null}
        </View>
      );
    }
    case 'name':
      return (
        <JobField value={text} onChangeText={onChange} placeholder={t('job.form.namePlaceholder')} maxLength={STEP_FORM_LIMITS.maxNameLength} autoCapitalize="words" accessibilityLabel={label} />
      );
    case 'number':
      return (
        <JobField value={text} onChangeText={onChange} placeholder="0" keyboardType="decimal-pad" maxLength={24} accessibilityLabel={label} />
      );
    case 'choice':
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(1.5) }}>
          {(field.options ?? []).map((o) => {
            const on = text === o;
            return (
              <Pressable
                key={o}
                onPress={() => onChange(on ? '' : o)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={o}
                style={({ pressed }) => ({
                  maxWidth: '100%', minHeight: 38, justifyContent: 'center',
                  borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(1.5),
                  backgroundColor: on ? c.accentTint : c.well,
                  borderWidth: 1.5, borderColor: on ? c.accent : 'transparent',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <AText variant="caption" numberOfLines={2} style={{ color: on ? c.accent : c.ink, fontSize: 13, flexShrink: 1 }}>{o}</AText>
              </Pressable>
            );
          })}
        </View>
      );
    case 'yesno':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1 }}>{value === true ? t('common.yes') : t('common.no')}</AText>
          <Switch
            value={value === true}
            onValueChange={(b) => onChange(b)}
            trackColor={{ true: c.accentSolid, false: c.well }}
            accessibilityLabel={label}
          />
        </View>
      );
    case 'date':
      return <InlineDay value={text} onChange={onChange} />;
    case 'photos':
      return <PhotoTiles photos={Array.isArray(value) ? value : []} onChange={onChange} />;
    case 'signature':
      return (
        <SignPad
          ref={padRef}
          hint={t(field.id === 'customer_signature' ? 'job.finish.handOver' : 'job.finish.signHere')}
          onInk={(v) => onChange(v)}
          onTouching={onTouching}
        />
      );
    default:
      return null;
  }
}

/**
 * Photos — camera and gallery tiles, as the job's own Photos section draws
 * them; a tap on a thumbnail takes it back off.
 */
function PhotoTiles({ photos, onChange }: { photos: DraftPhoto[]; onChange: (v: DraftPhoto[]) => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { takePhoto, pickFromGallery } = useImagePicker();
  const c = amazen.color;
  const max = STEP_FORM_LIMITS.maxPhotos;
  const full = photos.length >= max;
  const tile = { width: 64, height: 64, borderRadius: 14 };
  const add = (list: DraftPhoto[]) => onChange([...photos, ...list].slice(0, max));
  const dashed = [tile, { alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: c.lineField }];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {photos.map((p, i) => (
        <Pressable key={`${p.uri}:${i}`} onPress={() => onChange(photos.filter((_, k) => k !== i))} accessibilityRole="button" accessibilityLabel={t('common.remove')}>
          <Image source={{ uri: p.uri }} style={tile} />
        </Pressable>
      ))}
      {!full ? (
        <>
          <Pressable
            onPress={async () => { const p = await takePhoto('task-photo'); if (p) add([p]); }}
            accessibilityRole="button" accessibilityLabel={t('job.files.camera')}
            style={({ pressed }) => [...dashed, { opacity: pressed ? 0.7 : 1 }]}
          >
            <CameraGlyph size={20} color={c.inkMuted} contrast={c.tile} />
          </Pressable>
          <Pressable
            onPress={async () => { const ps = await pickFromGallery('task-photo'); if (ps.length) add(ps); }}
            accessibilityRole="button" accessibilityLabel={t('job.files.gallery')}
            style={({ pressed }) => [...dashed, { opacity: pressed ? 0.7 : 1 }]}
          >
            <GalleryGlyph size={20} color={c.inkMuted} contrast={c.tile} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * A day, picked IN the sheet — a row that opens a month in place.
 *
 * ⚠️ Not `DaySheet`: that is a sheet of its own, and a second sheet opened
 * from inside this one is the presentation UIKit refuses. Past days stay
 * open — "installed on" is a date in the past.
 */
function InlineDay({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatDateFull } = useTimeFormat();
  const c = amazen.color;
  const chosen = dayOf(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => { const d = chosen ?? new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const weeks = useMemo(() => monthGrid(view.y, view.m), [view]);
  const months = t('monthNames', { returnObjects: true }) as unknown as string[];
  const heads = t('dayNames.headers', { returnObjects: true }) as unknown as string[];
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const shift = (by: number) => setView((v) => { const d = new Date(v.y, v.m + by, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const pick = (d: Date) => { onChange(isoDay(d)); setOpen(false); };

  return (
    <View style={{ gap: amazen.space(2) }}>
      <Pressable
        onPress={() => {
          if (!open) { const d = chosen ?? new Date(); setView({ y: d.getFullYear(), m: d.getMonth() }); }
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityLabel={chosen ? formatDateFull(chosen, null) : t('job.form.pickDay')}
        style={({ pressed }) => ({
          minHeight: amazen.layout.tapMin, borderRadius: 16, borderWidth: 1.5, borderColor: open ? c.accent : c.lineWell,
          backgroundColor: c.sunken, paddingHorizontal: amazen.space(3.5), justifyContent: 'center', opacity: pressed ? 0.85 : 1,
        })}
      >
        <AText variant="body" numberOfLines={1} style={{ color: chosen ? c.inkStrong : c.inkMuted, fontSize: 14 }}>
          {chosen ? formatDateFull(chosen, null) : t('job.form.pickDay')}
        </AText>
      </Pressable>
      {open ? (
        <View style={{ gap: amazen.space(2) }}>
          <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
            <View style={{ flex: 1 }}><QuietButton label={t('common.today')} onPress={() => pick(now)} /></View>
            <View style={{ flex: 1 }}><QuietButton label={t('common.tomorrow')} onPress={() => pick(tomorrow)} /></View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            <Pressable onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} style={{ padding: amazen.space(2) }}>
              <AText variant="body" tone="strong">‹</AText>
            </Pressable>
            <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontFamily: amazen.font.sansMedium }}>
              {`${months?.[view.m] ?? ''} ${view.y}`}
            </AText>
            <Pressable onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel={t('common.next')} hitSlop={8} style={{ padding: amazen.space(2) }}>
              <AText variant="body" tone="strong">›</AText>
            </Pressable>
          </View>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {(Array.isArray(heads) ? heads : []).map((h, i) => (
                <AText key={i} variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>{h}</AText>
              ))}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row', gap: 4 }}>
                {week.map((d, di) => {
                  if (!d) return <View key={di} style={{ flex: 1, height: 38 }} />;
                  const on = !!chosen && sameDay(chosen, d);
                  return (
                    <Pressable
                      key={di}
                      onPress={() => pick(d)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={formatDateFull(d, null)}
                      style={({ pressed }) => ({
                        flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: on ? c.accentTint : pressed ? c.well : 'transparent',
                        borderWidth: 1.5, borderColor: on ? c.accent : sameDay(d, now) ? c.lineField : 'transparent',
                      })}
                    >
                      <AText numeric numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, color: on ? c.accent : c.inkStrong }}>{String(d.getDate())}</AText>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {chosen ? <QuietButton tone="critical" label={t('common.clear')} onPress={() => { onChange(''); setOpen(false); }} /> : null}
        </View>
      ) : null}
    </View>
  );
}
