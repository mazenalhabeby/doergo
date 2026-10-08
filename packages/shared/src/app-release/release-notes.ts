/**
 * WHAT IS NEW in a store version of the phone app — the words on the full-page update.
 *
 * Served by the server (`GET /app/version?lang=`), never bundled in the app: the page that announces
 * a version runs in the OLD app, so text shipped inside it is always one release behind. A new
 * release adds an entry here and a deploy; no app update is needed for its page.
 *
 * Rules: five languages per entry (English falls back for a missing one); the store name is the
 * `{{store}}` placeholder the app fills; no "paid"/"pay" wording; German formal ("Sie").
 */
import type { SupportedLocale } from '../notifications/locale';

/** Icons the app maps to its own icon set — a closed list, so the server can never name a missing one. */
export type ReleaseIcon = 'calendar' | 'crew' | 'role' | 'scan' | 'clock' | 'offline' | 'star';

export interface ReleaseNote {
  title: string;
  /** Contains `{{store}}`. */
  lead: string;
  points: { icon: ReleaseIcon; title: string; body: string }[];
  footer: string;
}

const N107: Record<SupportedLocale, ReleaseNote> = {
  en: {
    title: 'A better HBCField is ready',
    lead: 'Update on {{store}}. It takes about a minute and nothing you saved is lost.',
    points: [
      { icon: 'calendar', title: 'The company calendar', body: 'Day, 3 days, month or list. Appointments from start to end, and reminders that ring.' },
      { icon: 'crew', title: 'Jobs with a crew', body: 'Join with one tap. Your own time counts, and the job always has a leader.' },
      { icon: 'role', title: 'Jobs open to your trade', body: 'The office offers a job to everyone in your trade; the first to take it gets it.' },
      { icon: 'scan', title: 'Faster, more accurate scanning', body: 'Passports, licences, business cards and receipts read in one go.' },
    ],
    footer: 'New features come to this version first.',
  },
  de: {
    title: 'Ein besseres HBCField ist da',
    lead: 'Aktualisieren Sie über {{store}}. Das dauert etwa eine Minute, und nichts Gespeichertes geht verloren.',
    points: [
      { icon: 'calendar', title: 'Der Firmenkalender', body: 'Tag, 3 Tage, Monat oder Liste. Termine von Beginn bis Ende und Erinnerungen, die klingeln.' },
      { icon: 'crew', title: 'Aufträge im Team', body: 'Mit einem Tippen beitreten. Ihre eigene Zeit zählt, und jeder Auftrag hat einen Leiter.' },
      { icon: 'role', title: 'Aufträge für Ihr Gewerk', body: 'Das Büro bietet einen Auftrag allen in Ihrem Gewerk an; wer zuerst zugreift, bekommt ihn.' },
      { icon: 'scan', title: 'Schneller und genauer scannen', body: 'Pässe, Führerscheine, Visitenkarten und Belege in einem Durchgang gelesen.' },
    ],
    footer: 'Neue Funktionen kommen zuerst in diese Version.',
  },
  es: {
    title: 'Un HBCField mejor está listo',
    lead: 'Actualiza en {{store}}. Tarda un minuto y no pierdes nada de lo guardado.',
    points: [
      { icon: 'calendar', title: 'El calendario de la empresa', body: 'Día, 3 días, mes o lista. Citas de inicio a fin y recordatorios que suenan.' },
      { icon: 'crew', title: 'Trabajos en equipo', body: 'Únete con un toque. Cuenta tu propio tiempo y el trabajo siempre tiene un líder.' },
      { icon: 'role', title: 'Trabajos para tu oficio', body: 'La oficina ofrece un trabajo a todo tu oficio; el primero que lo toma, se lo queda.' },
      { icon: 'scan', title: 'Escaneo más rápido y preciso', body: 'Pasaportes, permisos, tarjetas y recibos leídos de una vez.' },
    ],
    footer: 'Las novedades llegan primero a esta versión.',
  },
  fr: {
    title: 'Un meilleur HBCField est prêt',
    lead: 'Mettez à jour sur {{store}}. Cela prend une minute et rien de ce que vous avez enregistré n’est perdu.',
    points: [
      { icon: 'calendar', title: 'Le calendrier de l’entreprise', body: 'Jour, 3 jours, mois ou liste. Rendez-vous du début à la fin, et rappels qui sonnent.' },
      { icon: 'crew', title: 'Travaux en équipe', body: 'Rejoignez d’un geste. Votre propre temps compte, et chaque travail a un responsable.' },
      { icon: 'role', title: 'Travaux pour votre métier', body: 'Le bureau propose un travail à tout votre métier ; le premier qui le prend l’obtient.' },
      { icon: 'scan', title: 'Numérisation plus rapide et plus précise', body: 'Passeports, permis, cartes de visite et reçus lus en une fois.' },
    ],
    footer: 'Les nouveautés arrivent d’abord dans cette version.',
  },
  it: {
    title: 'Un HBCField migliore è pronto',
    lead: 'Aggiorna su {{store}}. Ci vuole un minuto e non perdi nulla di quanto salvato.',
    points: [
      { icon: 'calendar', title: 'Il calendario aziendale', body: 'Giorno, 3 giorni, mese o elenco. Appuntamenti da inizio a fine e promemoria che suonano.' },
      { icon: 'crew', title: 'Lavori in squadra', body: 'Unisciti con un tocco. Conta il tuo tempo e il lavoro ha sempre un responsabile.' },
      { icon: 'role', title: 'Lavori per il tuo mestiere', body: 'L’ufficio offre un lavoro a tutto il tuo mestiere; il primo che lo prende lo ottiene.' },
      { icon: 'scan', title: 'Scansione più rapida e precisa', body: 'Passaporti, patenti, biglietti da visita e ricevute letti in un colpo.' },
    ],
    footer: 'Le novità arrivano prima in questa versione.',
  },
};

export const RELEASE_NOTES: Record<string, Record<SupportedLocale, ReleaseNote>> = {
  '1.0.7': N107,
};

/** The note for a version in a language (English when that language has none); null when there is no note. */
export function releaseNoteFor(version: string | null | undefined, lang?: string | null): ReleaseNote | null {
  if (!version) return null;
  const notes = RELEASE_NOTES[version];
  if (!notes) return null;
  const l = (lang ?? 'en').slice(0, 2).toLowerCase() as SupportedLocale;
  return notes[l] ?? notes.en;
}

/** `1.0.10` after `1.0.9` — numeric per part; a missing part reads 0. */
export function compareAppVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0), pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
