import { PERSON_BRIEF_SELECT } from '@hbcfield/shared';
/*
  Projections shared by the attendance collaborators (the heartbeat, the
  status/history reads and the entry lists).
*/

// The member an entry belongs to, as every attendance list shows them.
export const MEMBER_SELECT = PERSON_BRIEF_SELECT;

// Who edited an entry — surfaced on the "Edited" badge in the attendance table.
export const EDITOR_SELECT = { firstName: true, lastName: true } as const;

// Trimmed CompanyLocation projection for the hot attendance polls (P12) —
// getStatus/getHistory/heartbeat previously `include`d the full ~20-column row
// (incl. customer-contact fields, config, timestamps) when the clients only read
// these. Superset of every field the mobile/web attendance UI actually renders.
export const ATTENDANCE_LOCATION_SELECT = {
  id: true,
  name: true,
  address: true,
  lat: true,
  lng: true,
  geofenceRadius: true,
  geofencePolygon: true,
  timezone: true,
  workModel: true,
  kind: true,
  isActive: true,
  organizationId: true,
  // The ceiling on working away from here. Read wherever a workspace is handed
  // to a client that then decides whether to offer "away".
  geofencePolicy: true,
  // Clocking in here with no shift — tagged per member as `noShift`.
  noShiftPolicy: true,
  noShiftDailyMinutes: true,
} as const;
