import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { personName, memberMaySupply, checkScan } from '@hbcfield/shared';
import { DocumentReadQueue } from './document-read-queue.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { type DocumentActor } from './document-common';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';
import { DocumentChainService } from './document-chain.service';

/**
 * What a member supplying their own papers shares: never an external member, only
 * a type a member may supply, and the scan check on what they sent.
 */
@Injectable()
export abstract class DocumentSupplyBase {

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly storage: DocumentStorageService,
    protected readonly lookup: DocumentLookupService,
    protected readonly notifier: DocumentNotifierService,
    protected readonly chain: DocumentChainService,
    // Optional so the many unit tests that build this service bare keep working.
    @Optional() protected readonly readQueue?: DocumentReadQueue,
  ) {}


  /**
   * Step one, for the member: a link their own device can PUT the file to.
   *
   * NO PERMISSION IS CHECKED, and none ever will be. Supplying your own driving
   * licence is not an administrative act — it is the only way the organization
   * can get a document that only you possess. What is checked instead is the
   * TYPE: a member may upload against a SUPPLIED type and nothing else, so this
   * can never become a way to file yourself a payslip.
   */
  /**
   * Nobody uploads a personnel document for somebody else's employee.
   *
   * The company asks an external member for nothing — `requirementsFor` returns
   * an empty list for them — and the other half of that has to be true too: a
   * file we never asked for should not be accepted either. Otherwise a client's
   * supervisor uploads their passport into our organization's personnel store,
   * and we are holding an outsider's identity documents with no reason to and
   * no policy covering them.
   *
   * Refused rather than hidden, because hiding a button is a courtesy and this
   * is a rule. Signing is untouched: countersigning a document we sent them is
   * the one document flow that IS theirs.
   */
  protected assertNotExternal(actor: DocumentActor) {
    if (actor.isExternal) {
      throw new BadRequestException(
        'External members do not have a personnel file — nothing is required from them',
      );
    }
  }

  /**
   * Run the offline checks over whatever the scanner read.
   *
   * The one question this cannot answer alone is "has anybody else already
   * filed this exact document" — a database question — so it is resolved here
   * and handed to the pure checker.
   */
  protected async checkSubmittedScan(
    mrzText: string | null | undefined,
    member: { id: string; firstName: string; lastName: string; dateOfBirth?: Date | null },
    organizationId: string,
  ) {
    if (!mrzText?.trim()) return null;

    // Parse first, so the duplicate lookup has a number to look for.
    const provisional = checkScan({ mrzText, member });
    const documentNumber = provisional.extracted.documentNumber;

    let alreadyFiledBy: string | null = null;
    if (documentNumber) {
      /*
        The same document number under two names.

        Indexed on [organizationId, documentNumber]. Scoped to the organization
        deliberately: whether a licence appears in ANOTHER company's records is
        not this customer's business, and answering across tenants would leak
        one customer's workforce to another.
      */
      const other = await this.prisma.document.findFirst({
        where: {
          organizationId,
          documentNumber,
          userId: { not: member.id },
          status: { in: ['ISSUED', 'SIGNED', 'PENDING_VERIFICATION'] },
        },
        select: { user: { select: { firstName: true, lastName: true } } },
      });
      if (other) {
        alreadyFiledBy = personName(other.user);
      }
    }

    return checkScan({ mrzText, member, alreadyFiledBy });
  }

  /**
   * The type must exist, be in use, and be one the member is allowed to supply.
   *
   * Direction is the whole rule and it is enforced on the server every time,
   * not by which types the screen chose to offer.
   */
  protected async assertMemberSuppliableType(typeId: string, organizationId: string) {
    const type = await this.lookup.findTypeOr404(typeId, organizationId);
    if (!type.isActive) {
      throw new BadRequestException('That document type is no longer in use');
    }
    if (!memberMaySupply(type.direction)) {
      throw new ForbiddenException(
        `${type.label} is issued by your organization — you cannot upload one yourself`,
      );
    }
    return type;
  }
}
