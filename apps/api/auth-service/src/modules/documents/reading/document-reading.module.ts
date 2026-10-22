import { Module } from '@nestjs/common';
import { DocumentCoreModule } from '../core/document-core.module';
import { MrzOcrService } from './mrz-ocr.service';
import { DocumentReadQueue } from './document-read-queue.service';
import { OwnUploadReaderService } from './own-upload-reader.service';
import { DOCUMENT_READERS, OcrRulesReader, PdfTextReader } from './document-reader';

/**
 * Reading what a document says (expiry, names) — in-process, so passports never leave the box: the
 * readers in the order they are tried, the queue that reads after filing, and a member's own upload.
 */
@Module({
  imports: [DocumentCoreModule],
  providers: [
    MrzOcrService,
    DocumentReadQueue,
    OwnUploadReaderService,
    OcrRulesReader,
    PdfTextReader,
    {
      provide: DOCUMENT_READERS,
      // Each reader declines what it cannot read (an image to the PDF reader, a PDF to the OCR), so the
      // order only decides ties. A local AI engine later is one more entry here.
      useFactory: (pdf: PdfTextReader, ocr: OcrRulesReader) => [pdf, ocr],
      inject: [PdfTextReader, OcrRulesReader],
    },
  ],
  exports: [MrzOcrService, DocumentReadQueue, OwnUploadReaderService, DOCUMENT_READERS],
})
export class DocumentReadingModule {}
