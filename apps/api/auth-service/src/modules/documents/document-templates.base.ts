import { Injectable } from '@nestjs/common';
import { scoreTemplateBinding } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';

/** What writing and issuing a contract template share: finding the template that applies. */
@Injectable()
export abstract class DocumentTemplatesBase {

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly storage: DocumentStorageService,
    protected readonly lookup: DocumentLookupService,
    protected readonly notifier: DocumentNotifierService,
  ) {}


  /**
   * The template that applies to a role and a job title.
   *
   * Most specific wins: role AND position, then role alone, then position
   * alone, then the organization default. A template bound to nothing is the
   * fallback, so an organization can start with one contract and get more
   * precise later without re-pointing anything.
   */
  async resolveTemplate(data: {
    organizationId: string;
    roleId?: string | null;
    position?: string | null;
  }) {
    const candidates = await this.prisma.documentTemplate.findMany({
      where: { organizationId: data.organizationId, isActive: true },
      include: { type: { select: { id: true, label: true, retentionMonths: true } } },
    });
    if (candidates.length === 0) return null;

    // The scoring lives in the shared package because the admin screen shows
    // who a template will reach BEFORE it is saved. A second copy here would be
    // a screen that promises one contract and an invitation that issues another.
    const person = { memberRoleId: data.roleId ?? null, position: data.position ?? null };

    const best = candidates
      .map((t) => ({ t, s: scoreTemplateBinding(t, person) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)[0];

    return best?.t ?? null;
  }
}
