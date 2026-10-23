import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { formatDuration, type OutsideShiftWaiting } from '@hbcfield/shared/client';
import { Banner } from '@/components/amazen';
import { overtimeApi } from '@/lib/api';
import { formatDay } from '@/lib/money';

/**
 * Time worked outside the planned shift that a leader has not decided yet
 * (docs/plans/time-counting-model.md, phase 3): "1 h 30 m on 23 Oct waiting for Anna".
 * Nothing is lost silently — the member sees it waiting, and who decides. Read on focus,
 * online only; offline it simply says nothing.
 */
export function OutsideWaiting() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<OutsideShiftWaiting[]>([]);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      overtimeApi
        .outsideMine()
        .then((rows) => alive && setItems(Array.isArray(rows) ? rows.slice(0, 2) : []))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, []),
  );
  if (!items.length) return null;
  return (
    <>
      {items.map((w) => {
        const names = w.askedOf.names.join(', ');
        const who = w.askedOf.more ? t('attendance.outside.andMore', { names, count: w.askedOf.more }) : names;
        const params = {
          duration: formatDuration(w.total),
          day: formatDay(`${w.date}T12:00:00`, i18n.language),
          names: who,
        };
        return (
          <Banner
            key={w.entryId}
            tone="neutral"
            text={who ? t('attendance.outside.waiting', params) : t('attendance.outside.waitingNoName', params)}
          />
        );
      })}
    </>
  );
}
