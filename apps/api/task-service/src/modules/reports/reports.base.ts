import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { TaskAccessService } from '../../common/task-access/task-access.service';

/** What the service-report services share: their dependencies, and signing a report's attachment links. */
@Injectable()
export abstract class ReportsBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) protected readonly store: ObjectStore | null,
    protected readonly media: MediaSigner,
    @Inject('NOTIFICATION_SERVICE') protected readonly notificationClient: ClientProxy,
    protected readonly taskAccess: TaskAccessService,
  ) {}

  /** A report as a client receives it — photos behind signed links. */
  protected async withSignedAttachments<T extends { attachments?: any[] } | null>(report: T): Promise<T> {
    if (!report || !report.attachments) return report;
    return { ...report, attachments: await this.media.signAll(report.attachments) };
  }
}
