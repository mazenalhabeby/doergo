import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from '../notifications/locale';

/**
 * The names of a report's datasets and columns, in each language we write.
 *
 * ⚠️ ONE CATALOGUE FOR THREE READERS. A report is read on the web (the builder
 * and its table), taken away as a file (CSV, PDF) and delivered by email on a
 * schedule. The web runs in the reader's language, the file is made in the
 * requester's, and the email is rendered once per recipient language in
 * task-service. If each kept its own words, the German manager would get
 * "Stunden" on screen and "Hours worked" in Monday's email for the same column —
 * so the words live here, browser-safe, and all three read them.
 *
 * The registry in task-service names a KEY per dataset and field, never a
 * sentence; its English label is read back from this file so there is exactly
 * one English spelling too.
 *
 * ⚠️ ONLY THE SYSTEM'S OWN NAMES. What an organization wrote — a custom field,
 * a workflow status, a workspace name, a client — is data and stays as written.
 * Values in the rows (a status code, a person's name) are data as well.
 *
 * Product rules the parity spec holds: every key carries all five languages,
 * German is formal, and time is "worked" or "counted", never "paid".
 */
type Labels = Record<SupportedLocale, string>;

export const REPORT_LABELS = {
  // ── Datasets ──────────────────────────────────────────────────────────────
  'dataset.attendance': { en: 'Attendance / Timesheets', de: 'Anwesenheit / Stundenzettel', es: 'Asistencia / Hojas de horas', fr: 'Présence / Feuilles de temps', it: 'Presenze / Fogli ore' },
  'dataset.service_reports': { en: 'Service Reports (jobs)', de: 'Serviceberichte (Aufträge)', es: 'Informes de servicio (trabajos)', fr: 'Rapports d’intervention (interventions)', it: 'Rapporti di intervento (lavori)' },
  'dataset.tasks': { en: 'Tasks', de: 'Aufgaben', es: 'Tareas', fr: 'Tâches', it: 'Attività' },
  'dataset.leave': { en: 'Leave & absence', de: 'Urlaub & Abwesenheit', es: 'Permisos y ausencias', fr: 'Congés et absences', it: 'Ferie e assenze' },
  'dataset.parts': { en: 'Parts & materials', de: 'Teile & Material', es: 'Piezas y materiales', fr: 'Pièces et matériaux', it: 'Ricambi e materiali' },
  'dataset.asset_maintenance': { en: 'Asset maintenance', de: 'Anlagenwartung', es: 'Mantenimiento de activos', fr: 'Maintenance des équipements', it: 'Manutenzione degli asset' },
  'dataset.task_cycle': { en: 'Task cycle time', de: 'Durchlaufzeit von Aufgaben', es: 'Tiempo de ciclo de las tareas', fr: 'Durée de cycle des tâches', it: 'Tempo di ciclo delle attività' },

  // ── Columns: who, where, what ─────────────────────────────────────────────
  'col.period': { en: 'Period', de: 'Zeitraum', es: 'Periodo', fr: 'Période', it: 'Periodo' },
  'col.technician': { en: 'Technician', de: 'Techniker', es: 'Técnico', fr: 'Technicien', it: 'Tecnico' },
  'col.assignee': { en: 'Assignee', de: 'Zuständige(r)', es: 'Responsable', fr: 'Personne assignée', it: 'Assegnatario' },
  'col.space': { en: 'Space', de: 'Arbeitsbereich', es: 'Espacio de trabajo', fr: 'Espace de travail', it: 'Spazio di lavoro' },
  'col.status': { en: 'Status', de: 'Status', es: 'Estado', fr: 'Statut', it: 'Stato' },
  'col.priority': { en: 'Priority', de: 'Priorität', es: 'Prioridad', fr: 'Priorité', it: 'Priorità' },
  'col.customer': { en: 'Customer', de: 'Kunde', es: 'Cliente', fr: 'Client', it: 'Cliente' },
  'col.reason': { en: 'Reason', de: 'Grund', es: 'Motivo', fr: 'Motif', it: 'Motivo' },
  'col.part': { en: 'Part', de: 'Teil', es: 'Pieza', fr: 'Pièce', it: 'Ricambio' },
  'col.asset': { en: 'Asset', de: 'Anlage', es: 'Activo', fr: 'Équipement', it: 'Asset' },

  // ── Columns: measures ─────────────────────────────────────────────────────
  'col.hoursWorked': { en: 'Hours worked', de: 'Gearbeitete Stunden', es: 'Horas trabajadas', fr: 'Heures travaillées', it: 'Ore lavorate' },
  'col.overtimeHours': { en: 'Overtime hours', de: 'Überstunden', es: 'Horas extra', fr: 'Heures supplémentaires', it: 'Ore di straordinario' },
  'col.breakHours': { en: 'Break hours', de: 'Pausenstunden', es: 'Horas de descanso', fr: 'Heures de pause', it: 'Ore di pausa' },
  'col.shifts': { en: 'Shifts', de: 'Schichten', es: 'Turnos', fr: 'Postes', it: 'Turni' },
  'col.people': { en: 'People', de: 'Personen', es: 'Personas', fr: 'Personnes', it: 'Persone' },
  'col.jobsCompleted': { en: 'Jobs completed', de: 'Erledigte Aufträge', es: 'Trabajos completados', fr: 'Interventions terminées', it: 'Lavori completati' },
  'col.workHours': { en: 'Work hours', de: 'Arbeitsstunden', es: 'Horas de trabajo', fr: 'Heures de travail', it: 'Ore di lavoro' },
  'col.avgJobMinutes': { en: 'Avg job (min)', de: 'Ø Auftrag (Min.)', es: 'Trabajo medio (min)', fr: 'Intervention moy. (min)', it: 'Lavoro medio (min)' },
  'col.customers': { en: 'Customers', de: 'Kunden', es: 'Clientes', fr: 'Clients', it: 'Clienti' },
  'col.tasks': { en: 'Tasks', de: 'Aufgaben', es: 'Tareas', fr: 'Tâches', it: 'Attività' },
  'col.completed': { en: 'Completed', de: 'Erledigt', es: 'Completadas', fr: 'Terminées', it: 'Completate' },
  'col.routeDistanceKm': { en: 'Route distance (km)', de: 'Fahrtstrecke (km)', es: 'Distancia recorrida (km)', fr: 'Distance parcourue (km)', it: 'Distanza percorsa (km)' },
  'col.requests': { en: 'Requests', de: 'Anträge', es: 'Solicitudes', fr: 'Demandes', it: 'Richieste' },
  'col.daysOff': { en: 'Days off', de: 'Freie Tage', es: 'Días libres', fr: 'Jours d’absence', it: 'Giorni di assenza' },
  'col.quantity': { en: 'Quantity', de: 'Menge', es: 'Cantidad', fr: 'Quantité', it: 'Quantità' },
  'col.cost': { en: 'Cost', de: 'Kosten', es: 'Coste', fr: 'Coût', it: 'Costo' },
  'col.lineItems': { en: 'Line items', de: 'Positionen', es: 'Líneas', fr: 'Lignes', it: 'Righe' },
  'col.services': { en: 'Services', de: 'Wartungen', es: 'Servicios', fr: 'Interventions', it: 'Interventi' },
  'col.assets': { en: 'Assets', de: 'Anlagen', es: 'Activos', fr: 'Équipements', it: 'Asset' },
  'col.avgCycleHours': { en: 'Avg cycle (h)', de: 'Ø Durchlaufzeit (Std.)', es: 'Ciclo medio (h)', fr: 'Cycle moy. (h)', it: 'Ciclo medio (h)' },
  'col.avgCycleDays': { en: 'Avg cycle (days)', de: 'Ø Durchlaufzeit (Tage)', es: 'Ciclo medio (días)', fr: 'Cycle moy. (jours)', it: 'Ciclo medio (giorni)' },

  // ── Columns: the day-by-day timesheet ─────────────────────────────────────
  'col.date': { en: 'Date', de: 'Datum', es: 'Fecha', fr: 'Date', it: 'Data' },
  'col.day': { en: 'Day', de: 'Tag', es: 'Día', fr: 'Jour', it: 'Giorno' },
  'col.clockIn': { en: 'Clock in', de: 'Einstempeln', es: 'Entrada', fr: 'Pointage entrée', it: 'Entrata' },
  'col.clockOut': { en: 'Clock out', de: 'Ausstempeln', es: 'Salida', fr: 'Pointage sortie', it: 'Uscita' },
  'col.hours': { en: 'Hours', de: 'Stunden', es: 'Horas', fr: 'Heures', it: 'Ore' },
  'col.break': { en: 'Break', de: 'Pause', es: 'Descanso', fr: 'Pause', it: 'Pausa' },
  'col.overtime': { en: 'Overtime', de: 'Überstunden', es: 'Horas extra', fr: 'Heures supplémentaires', it: 'Straordinario' },
  'col.jobs': { en: 'Jobs', de: 'Aufträge', es: 'Trabajos', fr: 'Interventions', it: 'Interventi' },
  'col.leaveReason': { en: 'Leave reason', de: 'Abwesenheitsgrund', es: 'Motivo de ausencia', fr: 'Motif du congé', it: 'Motivo assenza' },
  'col.location': { en: 'Location', de: 'Standort', es: 'Ubicación', fr: 'Site', it: 'Sede' },
  'col.remote': { en: 'Remote', de: 'Remote', es: 'Remoto', fr: 'À distance', it: 'Remoto' },
  'col.note': { en: 'Note', de: 'Notiz', es: 'Nota', fr: 'Note', it: 'Nota' },
} as const satisfies Record<string, Labels>;

export type ReportLabelKey = keyof typeof REPORT_LABELS;

export function isReportLabelKey(key: unknown): key is ReportLabelKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(REPORT_LABELS, key);
}

/**
 * A dataset's or column's name in a language.
 *
 * Any locale spelling a caller has ("de-AT", "DE", an i18next language) is
 * accepted and narrowed; an unknown one reads English. An unknown KEY returns
 * the fallback — a column the catalogue does not know (a future one, or one an
 * organization named) keeps the words it arrived with rather than going blank.
 */
export function reportLabel(locale: unknown, key: string | null | undefined, fallback = ''): string {
  if (!isReportLabelKey(key)) return fallback;
  const labels: Labels = REPORT_LABELS[key];
  return labels[normalizeLocale(locale) ?? DEFAULT_LOCALE];
}

/** The English name — what the registry sends as `label`, for a reader that does not translate. */
export function reportLabelEn(key: ReportLabelKey): string {
  return REPORT_LABELS[key].en;
}

/**
 * A result's columns with their names in `locale`. Columns without a known
 * `labelKey` pass through untouched, so a report run against an older server —
 * or a column somebody else named — still has a heading.
 */
export function localizeReportColumns<T extends { label: string; labelKey?: string | null }>(
  columns: readonly T[],
  locale: unknown,
): T[] {
  return columns.map((c) => (isReportLabelKey(c.labelKey) ? { ...c, label: reportLabel(locale, c.labelKey, c.label) } : c));
}
