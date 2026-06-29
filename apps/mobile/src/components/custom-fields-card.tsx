import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { useToast } from '../contexts/toast-context';
import { COLORS } from '../lib/constants';
import {
  customFieldsApi,
  type MobileCustomFieldDefinition,
  type MobileCustomFieldValue,
} from '../lib/api';

/**
 * Custom Fields card for the task detail screen. The applicable fields (the
 * task's Task Type + global fields) are resolved server-side, so this just
 * renders + saves whatever comes back. Self-hides when the task type has none.
 */
export function CustomFieldsCard({ taskId }: { taskId: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();

  const [defs, setDefs] = useState<MobileCustomFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows: MobileCustomFieldValue[] = await customFieldsApi.getTaskValues(taskId);
        if (cancelled) return;
        const definitions = rows
          .map((r) => r.definition)
          .filter((d): d is MobileCustomFieldDefinition => !!d && d.isActive)
          .sort((a, b) => a.position - b.position);
        const valueMap: Record<string, string> = {};
        rows.forEach((r) => { valueMap[r.definitionId] = r.value ?? ''; });
        setDefs(definitions);
        setValues(valueMap);
        setInitial(valueMap);
      } catch {
        // Non-fatal: hide the section if it can't load.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [taskId]);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const setVal = useCallback((id: string, v: string) => {
    setValues((prev) => ({ ...prev, [id]: v }));
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      const payload = Object.entries(values)
        .filter(([, v]) => v !== '')
        .map(([definitionId, value]) => ({ definitionId, value }));
      await customFieldsApi.setTaskValues(taskId, payload);
      setInitial(values);
      toast.success(t('components.customFieldsCard.savedTitle'), t('components.customFieldsCard.savedMessage'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('components.customFieldsCard.couldNotSave'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || defs.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Ionicons name="options-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('components.customFieldsCard.title')}</Text>
        {dirty && (
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}
            onPress={save}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveText}>{t('common.save')}</Text>}
          </TouchableOpacity>
        )}
      </View>

      {defs.map((def) => (
        <View key={def.id} style={styles.field}>
          {def.type !== 'CHECKBOX' && (
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {def.name}
              {def.isRequired && <Text style={{ color: '#ef4444' }}> *</Text>}
            </Text>
          )}
          <FieldInput def={def} value={values[def.id] ?? ''} onChange={(v) => setVal(def.id, v)} colors={colors} />
        </View>
      ))}
    </View>
  );
}

function FieldInput({
  def,
  value,
  onChange,
  colors,
}: {
  def: MobileCustomFieldDefinition;
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const { t } = useTranslation();
  const inputStyle = [
    styles.input,
    { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary },
  ];

  switch (def.type) {
    case 'CHECKBOX':
      return (
        <View style={styles.checkboxRow}>
          <Switch value={value === 'true'} onValueChange={(b) => onChange(b ? 'true' : 'false')} />
          <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>{def.name}</Text>
        </View>
      );
    case 'DROPDOWN':
      return (
        <View style={styles.chips}>
          {(def.options || []).map((opt) => {
            const active = value === opt;
            return (
              <TouchableOpacity
                key={opt}
                onPress={() => onChange(active ? '' : opt)}
                style={[
                  styles.chip,
                  { borderColor: active ? COLORS.primary : colors.border, backgroundColor: active ? COLORS.primary : 'transparent' },
                ]}
              >
                <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 13 }}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    default:
      return (
        <TextInput
          style={inputStyle}
          value={value}
          onChangeText={onChange}
          placeholder={def.type === 'DATE' ? 'YYYY-MM-DD' : t('components.customFieldsCard.enterField', { field: def.name.toLowerCase() })}
          placeholderTextColor={colors.textMuted}
          keyboardType={def.type === 'NUMBER' ? 'numeric' : def.type === 'EMAIL' ? 'email-address' : 'default'}
          autoCapitalize={def.type === 'EMAIL' || def.type === 'URL' ? 'none' : 'sentences'}
        />
      );
  }
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '600', flex: 1 },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  field: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '500', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkboxLabel: { fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
});
