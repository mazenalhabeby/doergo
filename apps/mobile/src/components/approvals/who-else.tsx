import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { approvalWhyText, type ApprovalItem, type ApprovalRouting, type ApprovalT } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { approvalsApi } from '../../lib/api';
import { AText, SectionLabel } from '../amazen';

/**
 * Why this member sees the item, who else could decide it, and who is told —
 * read once when the item is opened (online; on failure the section simply
 * says nothing more).
 */
export function WhoElse({ item }: { item: ApprovalItem }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [route, setRoute] = useState<ApprovalRouting | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    approvalsApi.route(item.kind, item.id).then((r) => live && setRoute(r)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [item.kind, item.id]);

  const why = approvalWhyText(item, t as unknown as ApprovalT);

  return (
    <View style={{ gap: amazen.space(2) }}>
      {why ? (
        <AText variant="caption" tone="onGlass">
          <AText variant="caption" tone="strong">{`${t('approvals.why.title')}: `}</AText>
          {why}
        </AText>
      ) : null}
      {failed ? null : (
        <View
          style={{
            backgroundColor: c.well,
            borderRadius: amazen.radius.panel,
            paddingHorizontal: amazen.space(3.5),
            paddingVertical: amazen.space(2.5),
            gap: amazen.space(1.5),
          }}>
          <SectionLabel>{t('approvals.route.title')}</SectionLabel>
          {!route ? (
            <AText variant="caption" tone="muted">{t('approvals.route.loading')}</AText>
          ) : !route.deciders.length ? (
            <AText variant="caption" tone="muted">{t('approvals.route.onlyYou')}</AText>
          ) : (
            <>
              {route.deciders.map((d) => (
                <View
                  key={d.id}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: amazen.space(3),
                    opacity: d.onLeave ? 0.6 : 1,
                  }}>
                  <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 13.5, flexShrink: 1 }}>{d.name}</AText>
                  <AText variant="caption" tone="muted">
                    {d.onLeave ? t('approvals.route.onLeave') : t(`approvals.route.via.${d.via}`)}
                  </AText>
                </View>
              ))}
              {route.moreDeciders > 0 ? (
                <AText variant="caption" tone="muted">
                  {t('approvals.route.more', { count: route.moreDeciders })}
                </AText>
              ) : null}
            </>
          )}
          {route?.told.length ? (
            <AText
              variant="caption"
              tone="muted"
            >{`${t('approvals.route.told', { name: item.subject.name })}: ${route.told.map((p) => p.name).join(', ')}`}</AText>
          ) : null}
        </View>
      )}
    </View>
  );
}
