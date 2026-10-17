import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { type StepForm, type StepFormField } from '@hbcfield/shared/client';
import { useTheme } from '../../../contexts/theme-context';
import { AText, PrimaryButton, Banner, QuietButton } from '../../amazen';
import { JobSheet } from '../job-ui';
import { type SignPadHandle } from '../sign-pad';
import {
  draftErrors,
  emptyDraft,
  errorKey,
  fieldLabel,
  formCounts,
  groupOf,
  pageComplete,
  paginateForm,
  stillNeeded,
  type FormDraft,
} from '../step-form-logic';
import { errorParams, FieldWell, FieldInput } from '../step-form-fields';

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
  const formKey = form
    ? `${form.version}:${form.fields.map((f) => `${f.id}.${f.type}.${f.required ? 1 : 0}`).join(',')}`
    : '';
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

  if (!form)
    return (
      <JobSheet visible={false} onClose={onClose}>
        {null}
      </JobSheet>
    );

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
        <AText
          variant="h2"
          tone="strong"
          numberOfLines={2}
          style={{ fontFamily: amazen.font.sansLight, flexShrink: 1 }}
        >
          {title}
        </AText>
        <AText variant="caption" tone="ink" numberOfLines={1}>
          {t('job.form.counts', { required: counts.required, total: counts.total })}
        </AText>
      </View>

      {pages.length > 1 ? (
        <View style={{ gap: amazen.space(1.5) }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {pages.map((_, i) => (
              <View
                key={i}
                style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= page ? c.accent : c.tile }}
              />
            ))}
          </View>
          <AText variant="caption" tone="ink" numberOfLines={1}>
            {t('job.finish.step', { index: page + 1, total: pages.length, name: pageName(current) })}
          </AText>
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
                padRef={(h) => {
                  pads.current[f.id] = h;
                }}
                onTouching={setTouching}
              />
            </FieldWell>
          ))}
        </View>
      ))}

      {last ? (
        <PrimaryButton
          label={title}
          onPress={() => void send()}
          disabled={!canGo || busy || signing}
          loading={busy || signing}
        />
      ) : (
        <PrimaryButton
          label={t('common.next')}
          onPress={() => setPage((x) => Math.min(pages.length - 1, x + 1))}
          disabled={!canGo}
        />
      )}
      {!canGo && missing.length ? (
        <AText variant="caption" tone="ink" numberOfLines={3} style={{ textAlign: 'center' }}>
          {t('job.finish.stillNeeded', { list: missing.join(', ') })}
        </AText>
      ) : null}
      {page > 0 ? (
        <QuietButton
          label={t('common.back')}
          onPress={() => setPage((x) => Math.max(0, x - 1))}
          disabled={busy || signing}
        />
      ) : null}
    </JobSheet>
  );
}
