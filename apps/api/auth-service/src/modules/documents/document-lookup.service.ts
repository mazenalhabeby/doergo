import { Injectable, NotFoundException } from '@nestjs/common';
import { type SignerStep } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The small lookups every part of the personnel file asks: a type, a member of
 * this organization, a document's signing steps.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentLookupService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /** The chain on one document, in order — the shape every caller reasons about. */
  async signerSteps(documentId: string): Promise<SignerStep[]> {
    const rows = await this.prisma.documentSigner.findMany({
      where: { documentId },
      orderBy: { order: 'asc' },
      select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true, signedAt: true },
    });
    return rows as SignerStep[];
  }

  async findTypeOr404(id: string, organizationId: string) {
    const type = await this.prisma.documentType.findFirst({
      where: { id, organizationId },
    });
    if (!type) throw new NotFoundException('Document type not found');
    return type;
  }

  /**
   * The tenant check every write goes through.
   *
   * Returns the member so callers that need their name for a notification do
   * not fetch them twice.
   */
  async assertMemberOfOrg(userId: string, organizationId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }
}
