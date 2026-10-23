import type { SupportedLocale } from '@hbcfield/shared';

/**
 * Attendance sentences kept beside the main catalogue (push-messages.ts is at its
 * size limit): the working day decided (modules/events/attendance/day-decided.handler.ts) and the
 * automatic rest starting (attendance-push.service sendRestStartedPush), and a day's hours
 * set by the office (time-off-notification.handler.ts). Merged
 * with the main one in push-catalogue.ts; the type makes every language required.
 */
const en = {
  'attendance.restStarted.title': 'Your {{rest}} has started',
  'attendance.dayDecided.titleApproved': '{{day}} approved',
  'attendance.dayDecided.bodyApproved': '{{day}} approved · {{counted}} counted',
  'attendance.dayDecided.titleRejected': '{{day}} not approved',
  'attendance.dayDecided.bodyRejected': '{{day}} was not approved — open it to see why.',
  'attendance.hoursSet.title': 'Your hours changed',
  'attendance.hoursSet.body': '{{by}} set {{what}}',
} as const;

export type AttendancePushKey = keyof typeof en;

export const ATTENDANCE_PUSH_MESSAGES: Record<SupportedLocale, Record<AttendancePushKey, string>> = {
  en,
  de: {
    'attendance.restStarted.title': 'Ihre Pause hat begonnen: {{rest}}',
    'attendance.dayDecided.titleApproved': '{{day}} bestätigt',
    'attendance.dayDecided.bodyApproved': '{{day}} bestätigt · {{counted}} angerechnet',
    'attendance.dayDecided.titleRejected': '{{day}} nicht bestätigt',
    'attendance.dayDecided.bodyRejected': '{{day}} wurde nicht bestätigt — öffnen Sie ihn, um den Grund zu sehen.',
    'attendance.hoursSet.title': 'Ihre Arbeitszeit wurde geändert',
    'attendance.hoursSet.body': '{{by}} hat festgelegt: {{what}}',
  },
  es: {
    'attendance.restStarted.title': 'Tu descanso ha empezado: {{rest}}',
    'attendance.dayDecided.titleApproved': '{{day}} aprobado',
    'attendance.dayDecided.bodyApproved': '{{day}} aprobado · {{counted}} contabilizadas',
    'attendance.dayDecided.titleRejected': '{{day}} no aprobado',
    'attendance.dayDecided.bodyRejected': '{{day}} no fue aprobado: ábrelo para ver por qué.',
    'attendance.hoursSet.title': 'Tu horario ha cambiado',
    'attendance.hoursSet.body': '{{by}} ha fijado {{what}}',
  },
  fr: {
    'attendance.restStarted.title': 'Votre pause a commencé : {{rest}}',
    'attendance.dayDecided.titleApproved': '{{day}} validé',
    'attendance.dayDecided.bodyApproved': '{{day}} validé · {{counted}} comptées',
    'attendance.dayDecided.titleRejected': '{{day}} non validé',
    'attendance.dayDecided.bodyRejected': '{{day}} n’a pas été validé — ouvrez-le pour voir pourquoi.',
    'attendance.hoursSet.title': 'Vos horaires ont changé',
    'attendance.hoursSet.body': '{{by}} a fixé {{what}}',
  },
  it: {
    'attendance.restStarted.title': 'La tua pausa è iniziata: {{rest}}',
    'attendance.dayDecided.titleApproved': '{{day}} approvato',
    'attendance.dayDecided.bodyApproved': '{{day}} approvato · {{counted}} conteggiate',
    'attendance.dayDecided.titleRejected': '{{day}} non approvato',
    'attendance.dayDecided.bodyRejected': '{{day}} non è stato approvato: aprilo per vedere il motivo.',
    'attendance.hoursSet.title': 'Il tuo orario è cambiato',
    'attendance.hoursSet.body': '{{by}} ha impostato {{what}}',
  },
};
