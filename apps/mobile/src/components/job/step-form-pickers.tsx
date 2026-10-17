import { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { STEP_FORM_LIMITS } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { useImagePicker } from '../../hooks/useImagePicker';
import { AText, QuietButton } from '../amazen';
import { CameraGlyph, GalleryGlyph } from './job-glyphs';
import { monthGrid } from '../new-job/new-job-logic';
import { DayPickerTop, WeekdayHeads } from '../new-job/day-picker-parts';
import { dayOf, isoDay, type DraftPhoto } from './step-form-logic';
import { isSameDay } from '../../lib/utils';

/** A step form's photo tiles and inline day picker — moved here unchanged from step-form-sheet.tsx. */
/**
 * Photos — camera and gallery tiles, as the job's own Photos section draws
 * them; a tap on a thumbnail takes it back off.
 */
export function PhotoTiles({ photos, onChange }: { photos: DraftPhoto[]; onChange: (v: DraftPhoto[]) => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { takePhoto, pickFromGallery } = useImagePicker();
  const c = amazen.color;
  const max = STEP_FORM_LIMITS.maxPhotos;
  const full = photos.length >= max;
  const tile = { width: 64, height: 64, borderRadius: 14 };
  const add = (list: DraftPhoto[]) => onChange([...photos, ...list].slice(0, max));
  const dashed = [
    tile,
    {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 1.5,
      borderStyle: 'dashed' as const,
      borderColor: c.lineField,
    },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {photos.map((p, i) => (
        <Pressable
          key={`${p.uri}:${i}`}
          onPress={() => onChange(photos.filter((_, k) => k !== i))}
          accessibilityRole="button"
          accessibilityLabel={t('common.remove')}
        >
          <Image source={{ uri: p.uri }} style={tile} />
        </Pressable>
      ))}
      {!full ? (
        <>
          <Pressable
            onPress={async () => {
              const p = await takePhoto('task-photo');
              if (p) add([p]);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('job.files.camera')}
            style={({ pressed }) => [...dashed, { opacity: pressed ? 0.7 : 1 }]}
          >
            <CameraGlyph size={20} color={c.inkMuted} contrast={c.tile} />
          </Pressable>
          <Pressable
            onPress={async () => {
              const ps = await pickFromGallery('task-photo');
              if (ps.length) add(ps);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('job.files.gallery')}
            style={({ pressed }) => [...dashed, { opacity: pressed ? 0.7 : 1 }]}
          >
            <GalleryGlyph size={20} color={c.inkMuted} contrast={c.tile} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

/**
 * A day, picked IN the sheet — a row that opens a month in place.
 *
 * ⚠️ Not `DaySheet`: that is a sheet of its own, and a second sheet opened
 * from inside this one is the presentation UIKit refuses. Past days stay
 * open — "installed on" is a date in the past.
 */
export function InlineDay({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatDateFull } = useTimeFormat();
  const c = amazen.color;
  const chosen = dayOf(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = chosen ?? new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const weeks = useMemo(() => monthGrid(view.y, view.m), [view]);
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const shift = (by: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + by, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const pick = (d: Date) => {
    onChange(isoDay(d));
    setOpen(false);
  };

  return (
    <View style={{ gap: amazen.space(2) }}>
      <Pressable
        onPress={() => {
          if (!open) {
            const d = chosen ?? new Date();
            setView({ y: d.getFullYear(), m: d.getMonth() });
          }
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityLabel={chosen ? formatDateFull(chosen, null) : t('job.form.pickDay')}
        style={({ pressed }) => ({
          minHeight: amazen.layout.tapMin,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: open ? c.accent : c.lineWell,
          backgroundColor: c.sunken,
          paddingHorizontal: amazen.space(3.5),
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <AText variant="body" numberOfLines={1} style={{ color: chosen ? c.inkStrong : c.inkMuted, fontSize: 14 }}>
          {chosen ? formatDateFull(chosen, null) : t('job.form.pickDay')}
        </AText>
      </Pressable>
      {open ? (
        <View style={{ gap: amazen.space(2) }}>
          <DayPickerTop
            year={view.y}
            month={view.m}
            onToday={() => pick(now)}
            onTomorrow={() => pick(tomorrow)}
            onShift={shift}
          />
          <View style={{ gap: 4 }}>
            <WeekdayHeads />
            {weeks.map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row', gap: 4 }}>
                {week.map((d, di) => {
                  if (!d) return <View key={di} style={{ flex: 1, height: 38 }} />;
                  const on = !!chosen && isSameDay(chosen, d);
                  return (
                    <Pressable
                      key={di}
                      onPress={() => pick(d)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={formatDateFull(d, null)}
                      style={({ pressed }) => ({
                        flex: 1,
                        height: 38,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? c.accentTint : pressed ? c.well : 'transparent',
                        borderWidth: 1.5,
                        borderColor: on ? c.accent : isSameDay(d, now) ? c.lineField : 'transparent',
                      })}
                    >
                      <AText
                        numeric
                        numberOfLines={1}
                        style={{ fontSize: 14, lineHeight: 18, color: on ? c.accent : c.inkStrong }}
                      >
                        {String(d.getDate())}
                      </AText>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {chosen ? (
            <QuietButton
              tone="critical"
              label={t('common.clear')}
              onPress={() => {
                onChange('');
                setOpen(false);
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
