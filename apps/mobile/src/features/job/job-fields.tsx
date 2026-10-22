import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { customFieldsApi, type MobileCustomFieldDefinition, type MobileCustomFieldValue } from '@/lib/api';
import { knownOffline } from '@/offline/connectivity';
import { AText, ChoicePill, PrimaryButton, JobField, SectionLabel } from '@/components/amazen';
import { JobSheet } from './job-ui';

/**
 * "Job fields" — the custom fields of the job's type, as a two-column grid
 * (`.cf`), with their editor in a sheet. The same data and the same save as
 * `CustomFieldsCard`; self-hides when the type has none.
 */
export function JobFields({ taskId, editable }: { taskId: string; editable: boolean }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const c = amazen.color;
  const [defs, setDefs] = useState<MobileCustomFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    customFieldsApi.getTaskValues(taskId).then((rows: MobileCustomFieldValue[]) => {
      if (cancelled) return;
      const definitions = rows
        .map((r) => r.definition)
        .filter((d): d is MobileCustomFieldDefinition => !!d && d.isActive)
        .sort((a, b) => a.position - b.position);
      const map: Record<string, string> = {};
      rows.forEach((r) => { map[r.definitionId] = r.value ?? ''; });
      setDefs(definitions);
      setValues(map);
    }).catch(() => undefined); // Non-fatal: the section simply is not drawn.
    return () => { cancelled = true; };
  }, [taskId]);

  const open = useCallback(() => { setDraft(values); setEditing(true); }, [values]);

  const save = async () => {
    try {
      setSaving(true);
      const payload = Object.entries(draft).filter(([, v]) => v !== '').map(([definitionId, value]) => ({ definitionId, value }));
      await customFieldsApi.setTaskValues(taskId, payload);
      setValues(draft);
      setEditing(false);
      toast.success(t('components.customFieldsCard.savedTitle'), t('components.customFieldsCard.savedMessage'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('components.customFieldsCard.couldNotSave'));
    } finally {
      setSaving(false);
    }
  };

  if (defs.length === 0) return null;
  const shown = (d: MobileCustomFieldDefinition) => {
    const v = values[d.id] ?? '';
    if (d.type === 'CHECKBOX') return v === 'true' ? t('common.yes') : t('common.no');
    return v || '—';
  };

  return (
    <View style={{ gap: amazen.space(1.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}><SectionLabel>{t('job.fields.title')}</SectionLabel></View>
        {editable ? (
          <Pressable onPress={open} accessibilityRole="button" hitSlop={8}>
            <AText variant="caption" tone="accent">{t('job.fields.edit')}</AText>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2) }}>
        {defs.map((d) => (
          <View
            key={d.id}
            style={{
              flexBasis: '47%',
              flexGrow: 1,
              backgroundColor: c.tile,
              borderRadius: 14,
              paddingVertical: amazen.space(2.5),
              paddingHorizontal: amazen.space(3),
              gap: 2,
            }}>
            <AText variant="caption" tone="ink" numberOfLines={1}>{d.name}</AText>
            <AText variant="caption" tone="strong" numberOfLines={3} style={{ fontSize: 13, lineHeight: 18 }}>{shown(d)}</AText>
          </View>
        ))}
      </View>

      <JobSheet visible={editing} onClose={() => setEditing(false)} title={t('job.fields.title')} busy={saving}>
        {defs.map((d) => (
          <View key={d.id} style={{ gap: amazen.space(1.5) }}>
            <SectionLabel>{d.isRequired ? `${d.name} *` : d.name}</SectionLabel>
            <FieldEditor def={d} value={draft[d.id] ?? ''} onChange={(v) => setDraft((p) => ({ ...p, [d.id]: v }))} />
          </View>
        ))}
        <PrimaryButton label={t('common.save')} onPress={() => void save()} loading={saving} disabled={knownOffline()} />
        {knownOffline() ? <AText variant="caption" tone="warn" style={{ textAlign: 'center' }}>{t('job.needsSignal')}</AText> : null}
      </JobSheet>
    </View>
  );
}

function FieldEditor({ def, value, onChange }: { def: MobileCustomFieldDefinition; value: string; onChange: (v: string) => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  if (def.type === 'CHECKBOX') {
    return (
      <Switch
        value={value === 'true'}
        onValueChange={(b) => onChange(b ? 'true' : 'false')}
        trackColor={{ true: c.accentSolid, false: c.tile }}
      />
    );
  }
  if (def.type === 'DROPDOWN') {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(1.5) }}>
        {(def.options || []).map((opt) => {
          const on = value === opt;
          return (
            <ChoicePill key={opt} label={opt} on={on} onPress={() => onChange(on ? '' : opt)} />
          );
        })}
      </View>
    );
  }
  return (
    <JobField
      value={value}
      onChangeText={onChange}
      placeholder={def.type === 'DATE' ? 'YYYY-MM-DD' : t('components.customFieldsCard.enterField', { field: def.name.toLowerCase() })}
      keyboardType={def.type === 'NUMBER' ? 'numeric' : def.type === 'EMAIL' ? 'email-address' : 'default'}
      autoCapitalize={def.type === 'EMAIL' || def.type === 'URL' ? 'none' : 'sentences'}
    />
  );
}
