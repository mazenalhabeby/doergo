import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService, nextInvoiceNumber, invoiceNumberPrefix, type IssuerSnapshot } from '@hbcfield/shared';
import { LegalEntitiesService } from './legal-entities.service';

/** The company that issues an invoice, how the invoice shows it, and that company's number series. */
@Injectable()
export class InvoiceIssuerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entities: LegalEntitiesService,
  ) {}

  /**
   * `{prefix}-{year}-{0001}` — one series per company prefix per year (shared nextInvoiceNumber).
   * Read-then-write: callers retry on P2002, which @@unique([organizationId, invoiceNumber]) raises.
   */
  async generateInvoiceNumber(organizationId: string, entityPrefix: string | null): Promise<string> {
    const year = new Date().getFullYear();
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { organizationId, invoiceNumber: { startsWith: invoiceNumberPrefix(entityPrefix, year) } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    return nextInvoiceNumber(entityPrefix, year, lastInvoice?.invoiceNumber ?? null);
  }

  /**
   * The company that issues an invoice: the one chosen (must be this organization's and on) →
   * the workspace's → its client's → the main one. A chosen id that is not usable is REFUSED,
   * never silently replaced — the biller picked a name to go on the paper.
   */
  async issuingEntity(
    organizationId: string,
    chosen: string | null | undefined,
    workspace: string | null,
    customerId: string | null,
  ) {
    const refused = await this.entities.assertUsable(organizationId, chosen);
    if (refused) return { error: refused };
    const client = customerId
      ? ((
          await this.prisma.customer.findFirst({
            where: { id: customerId, organizationId },
            select: { legalEntityId: true },
          })
        )?.legalEntityId ?? null)
      : null;
    const entity = await this.entities.resolveIssuer(organizationId, { invoice: chosen ?? null, workspace, client });
    if (!entity)
      return {
        error: {
          success: false as const,
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'COMPANY_MISSING',
          message: 'No company is set up to issue invoices.',
        },
      };
    return { entity };
  }

  /** The issuer as the invoice shows it: the frozen copy once issued, the live company for a draft. */
  async issuerFor(invoice: {
    organizationId: string;
    legalEntityId: string | null;
    issuer: unknown;
    currency: string;
    status?: string;
  }): Promise<IssuerSnapshot | null> {
    if (invoice.issuer && typeof invoice.issuer === 'object') return invoice.issuer as IssuerSnapshot;
    const id = invoice.legalEntityId ?? (await this.entities.ensureMain(invoice.organizationId));
    const entity = await this.entities.entityWithBank(invoice.organizationId, id);
    return entity ? this.entities.snapshotOf(entity, invoice.currency) : null;
  }
}
