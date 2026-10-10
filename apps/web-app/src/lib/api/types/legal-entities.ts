import type { BankAccountDetails, LegalEntityIdentity } from '@hbcfield/shared/client';

// ── Companies (legal entities) ─────────────────────────────────────────────

export interface LegalEntityBankAccount extends BankAccountDetails {
  id?: string;
  isDefault: boolean;
}


export interface LegalEntity extends LegalEntityIdentity {
  isMain: boolean;
  isActive: boolean;
  /** Only for admins and whoever manages invoices. */
  bankAccounts?: LegalEntityBankAccount[];
  _count?: { workspaces: number; customers: number; invoices: number; employees: number };
}


export type LegalEntityInput = Partial<Omit<LegalEntity, 'id' | 'isMain' | 'isActive' | '_count' | 'bankAccounts'>> & {
  bankAccounts?: LegalEntityBankAccount[];
};
