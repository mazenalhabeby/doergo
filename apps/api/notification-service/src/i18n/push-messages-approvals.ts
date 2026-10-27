import type { SupportedLocale } from '@hbcfield/shared';

/**
 * What an approval is ABOUT, in a reminder or a hand-over ("Dana's overtime is still waiting") — one word per
 * office-rule kind (shared RULE_KINDS). Kept beside the main catalogue (push-messages.ts is at its size limit);
 * merged in push-catalogue.ts, and the type makes every language name every kind.
 */
const en = {
  'approval.what.overtime': 'overtime',
  'approval.what.request': 'request',
  'approval.what.expense': 'expense',
  'approval.what.hours': 'changed hours',
  'approval.what.noShow': 'missed clock-in',
  'approval.what.assetProposal': 'asset papers',
  'approval.what.clientRequest': 'client request',
} as const;

export type ApprovalPushKey = keyof typeof en;

export const APPROVAL_PUSH_MESSAGES: Record<SupportedLocale, Record<ApprovalPushKey, string>> = {
  en,
  de: {
    'approval.what.overtime': 'Überstunden',
    'approval.what.request': 'Antrag',
    'approval.what.expense': 'Ausgabe',
    'approval.what.hours': 'geänderte Stunden',
    'approval.what.noShow': 'fehlende Anmeldung',
    'approval.what.assetProposal': 'Anlagenunterlagen',
    'approval.what.clientRequest': 'Kundenanfrage',
  },
  es: {
    'approval.what.overtime': 'horas extra',
    'approval.what.request': 'solicitud',
    'approval.what.expense': 'gasto',
    'approval.what.hours': 'horas cambiadas',
    'approval.what.noShow': 'fichaje que falta',
    'approval.what.assetProposal': 'documentos del activo',
    'approval.what.clientRequest': 'solicitud de cliente',
  },
  fr: {
    'approval.what.overtime': 'heures supplémentaires',
    'approval.what.request': 'demande',
    'approval.what.expense': 'dépense',
    'approval.what.hours': 'heures modifiées',
    'approval.what.noShow': 'pointage manquant',
    'approval.what.assetProposal': 'documents d’équipement',
    'approval.what.clientRequest': 'demande client',
  },
  it: {
    'approval.what.overtime': 'straordinari',
    'approval.what.request': 'richiesta',
    'approval.what.expense': 'spesa',
    'approval.what.hours': 'ore modificate',
    'approval.what.noShow': 'timbratura mancante',
    'approval.what.assetProposal': 'documenti del bene',
    'approval.what.clientRequest': 'richiesta cliente',
  },
};
