import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText, FilterPill, FilterRow, Well, WellDivider } from '../amazen';
import { SectionLabel } from '../job/job-ui';
import { TourTarget } from '../tour';
import { RequestRow, type RequestRowData } from '../requests/request-parts';
import type { RequestFilter } from './helpers';

const FILTERS: RequestFilter[] = ['upcoming', 'past', 'all'];

/** My requests: Upcoming / Past / All — every kind, each row opens its detail. */
export function TimeOffRequestsList({
  requests,
  filter,
  onFilter,
  onOpen,
  spaceName,
}: {
  /** Already filtered by `filter`. */
  requests: RequestRowData[];
  filter: RequestFilter;
  onFilter: (f: RequestFilter) => void;
  onOpen: (request: RequestRowData) => void;
  /** A workspace's name by id — for a request still on the phone, which carries only the id. */
  spaceName: (id: string | null | undefined) => string | null;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();

  return (
    <TourTarget name="timeoff-list" style={{ gap: amazen.space(2) }}>
      <SectionLabel style={{ paddingHorizontal: amazen.space(1) }}>{t('timeOff.myRequests')}</SectionLabel>
      <FilterRow>
        {FILTERS.map((f) => <FilterPill key={f} label={t(`timeOff.filters.${f}`)} on={filter === f} onPress={() => onFilter(f)} />)}
      </FilterRow>

      <Well style={{ paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(1.5) }}>
        {requests.length === 0 ? (
          <View style={{ paddingVertical: amazen.space(5), alignItems: 'center', gap: amazen.space(1) }}>
            <AText variant="body" tone="ink" style={{ textAlign: 'center' }}>{t(`timeOff.empty.${filter}`)}</AText>
            {filter === 'upcoming' ? (
              <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>{t('timeOff.empty.hint')}</AText>
            ) : null}
          </View>
        ) : (
          requests.map((r, i) => (
            <React.Fragment key={r.id}>
              {i > 0 ? <WellDivider /> : null}
              <RequestRow request={r} spaceName={spaceName(r.spaceId)} onPress={() => onOpen(r)} />
            </React.Fragment>
          ))
        )}
      </Well>
    </TourTarget>
  );
}
