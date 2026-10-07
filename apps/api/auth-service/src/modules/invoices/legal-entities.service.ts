import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  bankForInvoice,
  issuerSnapshotOf,
  parseBankAccounts,
  parseLegalEntity,
  resolveIssuerEntityId,
  usableLegalEntityId,
  COMPANY_UNKNOWN_MESSAGE,
  type BankAccountDetails,
  type IssuerSnapshot,
  type LegalEntityIdentity,
} from '@hbcfield/shared';

const IDENTITY = {
  id: true, legalName: true, label: true, addressLine1: true, addressLine2: true, postalCode: true, city: true,
  state: true, country: true, vatId: true, taxId: true, registerNumber: true, email: true, phone: true,
  website: true, logoUrl: true, currency: true, invoicePrefix: true,
} as const;
const BANK = { label: true, holder: true, bankName: true, iban: true, bic: true, accountNumber: true, routingNumber: true, currency: true, isDefault: true } as const;

type Fail = { success: false; statusCode: number; message: string; code?: string };
const fail = (statusCode: number, message: string, code?: string): Fail => ({ success: false, statusCode, message, ...(code ? { code } : {}) });

const PROBLEM_TEXT: Record<string, string> = {
  LEGAL_NAME_REQUIRED: 'Give the company its legal name.',
  COUNTRY_INVALID: 'The country must be a two-letter code (AT, US, …).',
  CURRENCY_INVALID: 'That currency is not supported.',
  PREFIX_INVALID: 'The invoice prefix is 1 to 8 letters or digits.',
  EMAIL_INVALID: 'That email address does not look right.',
  WEBSITE_INVALID: 'That website does not look right.',
  IBAN_INVALID: 'That IBAN is not valid — check the digits.',
  BIC_INVALID: 'That BIC / SWIFT code is not valid.',
  ROUTING_INVALID: 'That routing number is not valid (9 digits).',
  BANK_ACCOUNT_EMPTY: 'A bank account needs an IBAN or an account number.',
  TOO_MANY_BANK_ACCOUNTS: 'At most five bank accounts per company.',
};

/**
 * COMPANIES — the legal entities of an organization (docs/plans/companies-legal-entities.md).
 *
 * Every read and write is scoped by the caller's organization (from the token, never the body), and
 * every id that arrives from a form is checked to belong to it. The organization always has exactly
 * one MAIN company: created from its profile the first time anything needs one (`ensureMain`), so
 * an organization made after the migration needs no special path.
 */
@Injectable()
export class LegalEntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The main company's id, created from the organization's profile when there is none yet. */
  async ensureMain(organizationId: string): Promise<string> {
    const main = await this.prisma.legalEntity.findFirst({ where: { organizationId, isMain: true }, select: { id: true } });
    if (main) return main.id;
    const o = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, address: true, addressLine1: true, addressLine2: true, postalCode: true, city: true, state: true, country: true, vatId: true, email: true, phone: true, website: true, logoUrl: true, currency: true },
    });
    if (!o) throw new Error('Organization not found');
    try {
      const created = await this.prisma.legalEntity.create({
        data: {
          organizationId, legalName: o.name, addressLine1: o.addressLine1 ?? o.address, addressLine2: o.addressLine2, postalCode: o.postalCode,
          city: o.city, state: o.state, country: o.country, vatId: o.vatId, email: o.email, phone: o.phone, website: o.website,
          logoUrl: o.logoUrl, currency: o.currency, invoicePrefix: 'INV', isMain: true,
        },
        select: { id: true },
      });
      return created.id;
    } catch {
      // Two first requests at once: the one-main index let exactly one in.
      const again = await this.prisma.legalEntity.findFirst({ where: { organizationId, isMain: true }, select: { id: true } });
      if (again) return again.id;
      throw new Error('Could not create the main company');
    }
  }

  /**
   * The organization's companies. Bank accounts only when the caller may see them (`withBank`,
   * decided at the gateway from the caller's permissions) — a workspace manager choosing who
   * invoices a workspace needs the names, not the IBANs.
   */
  async list(data: { organizationId: string; withBank?: boolean; includeInactive?: boolean }) {
    await this.ensureMain(data.organizationId);
    const rows = await this.prisma.legalEntity.findMany({
      where: { organizationId: data.organizationId, ...(data.includeInactive ? {} : { isActive: true }) },
      select: {
        ...IDENTITY, isMain: true, isActive: true,
        ...(data.withBank ? { bankAccounts: { select: { id: true, ...BANK }, orderBy: { position: 'asc' } } } : {}),
        _count: { select: { workspaces: true, customers: true, invoices: true, employees: true } },
      },
      orderBy: [{ isMain: 'desc' }, { legalName: 'asc' }],
    });
    return { success: true, data: rows };
  }

  async create(data: { organizationId: string; input: Record<string, unknown> }) {
    const parsed = parseLegalEntity(data.input ?? {});
    if (!parsed.ok) return fail(HttpStatus.BAD_REQUEST, PROBLEM_TEXT[parsed.problem]!, `COMPANY_${parsed.problem}`);
    const banks = parseBankAccounts(data.input?.bankAccounts);
    if (!banks.ok) return fail(HttpStatus.BAD_REQUEST, PROBLEM_TEXT[banks.problem]!, `COMPANY_${banks.problem}`);
    await this.ensureMain(data.organizationId);
    const created = await this.prisma.legalEntity.create({
      data: {
        ...(parsed.value as Required<typeof parsed.value>), organizationId: data.organizationId, isMain: false,
        bankAccounts: { create: banks.value.map((b, i) => ({ ...b, position: i, organizationId: data.organizationId })) },
      },
      select: { id: true },
    });
    return this.one(data.organizationId, created.id);
  }

  async update(data: { organizationId: string; id: string; input: Record<string, unknown> }) {
    const own = await this.owned(data.organizationId, data.id);
    if (!own) return fail(HttpStatus.NOT_FOUND, 'Company not found');
    const parsed = parseLegalEntity(data.input ?? {}, true);
    if (!parsed.ok) return fail(HttpStatus.BAD_REQUEST, PROBLEM_TEXT[parsed.problem]!, `COMPANY_${parsed.problem}`);
    const replaceBanks = Array.isArray(data.input?.bankAccounts);
    const banks = replaceBanks ? parseBankAccounts(data.input.bankAccounts) : null;
    if (banks && !banks.ok) return fail(HttpStatus.BAD_REQUEST, PROBLEM_TEXT[banks.problem]!, `COMPANY_${banks.problem}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.legalEntity.update({ where: { id: own.id }, data: parsed.value });
      if (banks && banks.ok) {
        await tx.legalEntityBankAccount.deleteMany({ where: { legalEntityId: own.id } });
        if (banks.value.length) {
          await tx.legalEntityBankAccount.createMany({ data: banks.value.map((b, i) => ({ ...b, position: i, legalEntityId: own.id, organizationId: data.organizationId })) });
        }
      }
    });
    return this.one(data.organizationId, own.id);
  }

  /** Make another company the main one — both rows in one transaction (never two mains, never none). */
  async setMain(data: { organizationId: string; id: string }) {
    const own = await this.owned(data.organizationId, data.id);
    if (!own) return fail(HttpStatus.NOT_FOUND, 'Company not found');
    if (!own.isActive) return fail(HttpStatus.BAD_REQUEST, 'Switch the company on before making it the main one.', 'COMPANY_INACTIVE');
    await this.prisma.$transaction([
      this.prisma.legalEntity.updateMany({ where: { organizationId: data.organizationId, isMain: true }, data: { isMain: false } }),
      this.prisma.legalEntity.update({ where: { id: own.id }, data: { isMain: true } }),
    ]);
    return this.one(data.organizationId, own.id);
  }

  /** Switch a company off or on. The main one stays on; issued invoices keep their frozen issuer. */
  async setActive(data: { organizationId: string; id: string; active: boolean }) {
    const own = await this.owned(data.organizationId, data.id);
    if (!own) return fail(HttpStatus.NOT_FOUND, 'Company not found');
    if (own.isMain && !data.active) return fail(HttpStatus.BAD_REQUEST, 'The main company cannot be switched off — make another one main first.', 'COMPANY_IS_MAIN');
    await this.prisma.legalEntity.update({ where: { id: own.id }, data: { isActive: data.active } });
    return this.one(data.organizationId, own.id);
  }

  // ─── used by invoices, workspaces, clients, members ───────────────────────

  /** Is this id one of the organization's ACTIVE companies? Null and '' mean "not set" and pass. */
  async assertUsable(organizationId: string, id: string | null | undefined): Promise<Fail | null> {
    const r = await usableLegalEntityId(this.prisma as any, organizationId, id);
    return r.ok ? null : fail(HttpStatus.BAD_REQUEST, COMPANY_UNKNOWN_MESSAGE, 'COMPANY_UNKNOWN');
  }

  /**
   * Who issues an invoice: its own choice → the workspace's → the client's → the main company
   * (shared resolveIssuerEntityId). Returns the company with its bank accounts.
   */
  async resolveIssuer(organizationId: string, levels: { invoice?: string | null; workspace?: string | null; client?: string | null }) {
    const main = await this.ensureMain(organizationId);
    const ids = [levels.invoice, levels.workspace, levels.client, main].filter((x): x is string => !!x);
    const rows = await this.prisma.legalEntity.findMany({
      where: { organizationId, id: { in: ids }, isActive: true },
      select: { ...IDENTITY, bankAccounts: { select: BANK, orderBy: { position: 'asc' } } },
    });
    const chosen = resolveIssuerEntityId(levels, main, new Set(rows.map((r) => r.id)));
    return rows.find((r) => r.id === chosen) ?? null;
  }

  /** The issuer as an invoice shows it — frozen copy when issued, live (not frozen) for a draft. */
  snapshotOf(entity: (LegalEntityIdentity & { bankAccounts: (BankAccountDetails & { isDefault: boolean })[] }), currency: string | null): IssuerSnapshot {
    const { bankAccounts, ...identity } = entity;
    const bank = bankForInvoice(bankAccounts, currency);
    const bankOut: BankAccountDetails | null = bank
      ? { label: bank.label, holder: bank.holder, bankName: bank.bankName, iban: bank.iban, bic: bank.bic, accountNumber: bank.accountNumber, routingNumber: bank.routingNumber, currency: bank.currency }
      : null;
    return issuerSnapshotOf(identity, bankOut);
  }

  async entityWithBank(organizationId: string, id: string) {
    return this.prisma.legalEntity.findFirst({
      where: { id, organizationId },
      select: { ...IDENTITY, bankAccounts: { select: BANK, orderBy: { position: 'asc' } } },
    });
  }

  private owned(organizationId: string, id: string) {
    return this.prisma.legalEntity.findFirst({ where: { id, organizationId }, select: { id: true, isMain: true, isActive: true } });
  }

  private async one(organizationId: string, id: string) {
    const row = await this.prisma.legalEntity.findFirst({
      where: { id, organizationId },
      select: { ...IDENTITY, isMain: true, isActive: true, bankAccounts: { select: { id: true, ...BANK }, orderBy: { position: 'asc' } } },
    });
    return row ? { success: true, data: row } : fail(HttpStatus.NOT_FOUND, 'Company not found');
  }
}
