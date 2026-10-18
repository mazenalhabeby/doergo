import { combinedServices } from '../../../common/testing/combined-services';
import { AttachmentsService } from '../attachments.service';
import { AttachmentFilesService } from '../attachment-files.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AttachmentsService, as ONE object — the tests were written against the single class. */
export type AttachmentsServiceParts = Public<AttachmentsService> & Public<AttachmentFilesService>;

export function attachmentsParts(...args: unknown[]): AttachmentsServiceParts {
  const attachmentsService = new (AttachmentsService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const attachmentFilesService = new (AttachmentFilesService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<AttachmentsServiceParts>(attachmentsService, attachmentFilesService);
}
