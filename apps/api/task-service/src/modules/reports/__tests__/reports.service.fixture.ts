import { combinedServices } from '../../../common/testing/combined-services';
import { ReportsService } from '../reports.service';
import { ReportReadService } from '../report-read.service';
import { ReportPartsService } from '../report-parts.service';
import { ReportAttachmentsService } from '../report-attachments.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ReportsService, as ONE object — the tests were written against the single class. */
export type ReportsServiceParts = Public<ReportsService> &
  Public<ReportReadService> &
  Public<ReportPartsService> &
  Public<ReportAttachmentsService>;

/** All four over the same collaborators, given as (prisma, store, media, notificationClient, taskAccess). */
export function reportServices(
  prisma: any,
  store: any,
  media: any,
  notificationClient: any,
  taskAccess: any,
): ReportsServiceParts {
  return combinedServices<ReportsServiceParts>(
    new ReportsService(prisma, media, notificationClient),
    new ReportReadService(prisma, media, taskAccess),
    new ReportPartsService(prisma),
    new ReportAttachmentsService(prisma, store, media),
  );
}
