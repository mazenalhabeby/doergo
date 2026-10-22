import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CUSTOMER_STAGES, customerStageLabel, isCompany } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import type { MobileCustomer } from '@/lib/api';
import { AText, GlassCard, RoundButton } from '@/components/amazen';
import { Monogram } from '@/components/amazen/monogram';
import { CallGlyph, NavigateGlyph } from '@/components/glyphs/work-glyphs';
import { EmailGlyph, ReminderGlyph } from '@/components/glyphs/crm-glyphs';
import { geoUrl, mailtoUrl, openSafeUrl, telUrl } from '@/lib/safe-links';

/** The four steps of the pipeline; Inactive is not a step, it is leaving it. */
const STEPS = CUSTOMER_STAGES.filter((s) => s.key !== 'INACTIVE').map((s) => s.key);

/**
 * WHO THIS IS, AND THE FOUR THINGS YOU DO WITH A CLIENT.
 *
 * A button is drawn only when it can work — no Call without a number, no
 * Directions without an address — because a button that opens nothing on a
 * doorstep reads as a broken phone, not a missing number.
 *
 * ⚠️ The stage is a FACT and stays visible to somebody who may not move it;
 * only the ability is hidden (`canWork`). The stage used to be shown to
 * everybody as live pills and the tap 403'd.
 */
export function RecordHero({
  record, canWork, onStage, onRemind,
}: {
  record: MobileCustomer;
  canWork: boolean;
  onStage: (key: string) => void;
  onRemind: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const company = isCompany(record);
  const status = record.status || 'LEAD';
  const inactive = status === 'INACTIVE';
  const stepAt = STEPS.indexOf(status as (typeof STEPS)[number]);
  const stageName = (key: string) => t(`customers.stages.${key}`, { defaultValue: customerStageLabel(key) });
  const phone = record.phone?.trim();
  const email = record.email?.trim();
  const address = record.address?.trim();

  const kindLine = [
    t(company ? 'customers.record.kindCompany' : 'customers.record.kindPerson'),
    record.isContact ? t('customers.list.contactTag') : stageName(status),
    record.industry?.trim(),
  ].filter(Boolean).join(' · ');

  const acts: { key: string; label: string; Glyph: typeof CallGlyph; jade?: boolean; onPress: () => void }[] = [];
  // Built from typed CRM text: each link is one scheme or no button (`safe-links.ts`).
  const tel = telUrl(phone), mail = mailtoUrl(email), geo = geoUrl(address);
  if (tel)
    acts.push({
      key: 'call',
      label: t('customers.record.call'),
      Glyph: CallGlyph,
      jade: true,
      onPress: () => void openSafeUrl(tel),
    });
  if (mail) acts.push({ key: 'email', label: t('customers.record.email'), Glyph: EmailGlyph, onPress: () => void openSafeUrl(mail) });
  if (geo)
    acts.push({
      key: 'dir',
      label: t('customers.record.directions', 'Directions'),
      Glyph: NavigateGlyph,
      onPress: () => void openSafeUrl(geo),
    });
  acts.push({ key: 'remind', label: t('customers.record.remind', 'Remind'), Glyph: ReminderGlyph, onPress: onRemind });

  const app = record.app;
  const appLine = !record.isPortalResident && !app?.invited ? null
    : app?.active ? t('customers.record.app.active', { defaultValue: 'Uses the app' })
    : app?.accepted ? t('customers.record.app.accepted', { defaultValue: 'Has an app account' })
    : app?.invited ? t('customers.record.app.invited', { defaultValue: 'Invited to the app · not signed up yet' })
    : t('customers.appAccess');

  return (
    <GlassCard style={{ gap: amazen.space(4) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3.5) }}>
        <Monogram name={record.name} size={58} company={company} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AText variant="h2" tone="strong" numberOfLines={2} style={{ fontSize: 22, lineHeight: 26 }}>{record.name}</AText>
          <AText
            numberOfLines={1}
            style={{
              marginTop: 4,
              color: c.inkOnGlass,
              fontFamily: amazen.font.mono,
              fontSize: 10.5,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
            }}
          >
            {kindLine}
          </AText>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: acts.length < 4 ? 'flex-start' : 'space-between',
          gap: acts.length < 4 ? amazen.space(5) : 0,
        }}>
        {acts.map((a) => (
          <View key={a.key} style={{ alignItems: 'center', gap: 6, minWidth: 64 }}>
            <RoundButton Glyph={a.Glyph} label={a.label} tone={a.jade ? 'jade' : 'plain'} size={50} onPress={a.onPress} />
            <AText variant="caption" style={{ color: c.inkOnGlass, fontSize: 11.5 }}>{a.label}</AText>
          </View>
        ))}
      </View>

      {/* The pipeline as a bar. A person who is somebody's contact is not in anyone's pipeline, so they get none. */}
      {!record.isContact ? (
        <View style={{ gap: amazen.space(2) }}>
          <View style={{ flexDirection: 'row', gap: 4, opacity: inactive ? 0.4 : 1 }}>
            {STEPS.map((key, i) => {
              const reached = !inactive && i <= stepAt;
              const current = !inactive && i === stepAt;
              return (
                <Pressable
                  key={key}
                  onPress={() => onStage(key)}
                  disabled={!canWork || current}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current, disabled: !canWork }}
                  accessibilityLabel={`${t('customers.record.stage')}: ${stageName(key)}`}
                  hitSlop={{ top: 10, bottom: 10 }}
                  style={{ flex: 1, gap: 6 }}
                >
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: reached ? c.accent : c.tile }} />
                  <AText
                    numberOfLines={1}
                    style={{
                      fontFamily: amazen.font.mono,
                      fontSize: 9.5,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: current ? c.accent : c.inkMuted,
                    }}
                  >
                    {stageName(key)}
                  </AText>
                </Pressable>
              );
            })}
          </View>
          {canWork || inactive ? (
            <Pressable
              onPress={() => onStage(inactive ? 'LEAD' : 'INACTIVE')}
              disabled={!canWork}
              accessibilityRole="button"
              style={{
                alignSelf: 'flex-end',
                borderRadius: amazen.radius.full,
                borderWidth: 1,
                borderColor: inactive ? c.warn : c.lineGlass,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <AText
                style={{
                  fontFamily: amazen.font.mono,
                  fontSize: 10,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: inactive ? c.warn : c.inkOnGlass,
                }}>
                {inactive ? `● ${stageName('INACTIVE')}` : t('customers.record.markInactive', 'Mark inactive')}
              </AText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {appLine ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: app?.active ? c.accent : c.inkOnGlass }} />
          <AText variant="caption" numberOfLines={1} style={{ color: c.inkOnGlass, flexShrink: 1 }}>
            {[appLine, app?.portalName].filter(Boolean).join(' · ')}
          </AText>
        </View>
      ) : null}
    </GlassCard>
  );
}
