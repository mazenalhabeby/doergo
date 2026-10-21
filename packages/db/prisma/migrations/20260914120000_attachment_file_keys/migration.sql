-- Object keys instead of provider URLs.
--
-- Attachments stored `{endpoint}/{bucket}/{key}`, so moving storage provider
-- meant rewriting every row, and a row missed was a broken image. From now on
-- the key is stored and a URL is signed at read time. `fileUrl` stays one
-- release for app 1.0.5, which sends it on confirm.
--
-- Additive and idempotent. The backfill only touches rows that still have no
-- key, and only URLs shaped like a path-style bucket URL — anything else (a
-- legacy relative path) is left for the application's null handling.

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "fileKey" TEXT;
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "report_attachments" ADD COLUMN IF NOT EXISTS "fileKey" TEXT;
ALTER TABLE "report_attachments" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;

UPDATE "attachments"
SET "fileKey" = substring("fileUrl" from '^https?://[^/]+/[^/]+/(.+)$')
WHERE "fileKey" IS NULL AND "fileUrl" ~ '^https?://[^/]+/[^/]+/.+';

UPDATE "report_attachments"
SET "fileKey" = substring("fileUrl" from '^https?://[^/]+/[^/]+/(.+)$')
WHERE "fileKey" IS NULL AND "fileUrl" ~ '^https?://[^/]+/[^/]+/.+';

-- MIME from the extension, for the types uploads were ever allowed to have.
UPDATE "attachments" SET "mimeType" = CASE lower(substring("fileName" from '\.([A-Za-z0-9]+)$'))
    WHEN 'jpg' THEN 'image/jpeg' WHEN 'jpeg' THEN 'image/jpeg' WHEN 'png' THEN 'image/png'
    WHEN 'gif' THEN 'image/gif' WHEN 'webp' THEN 'image/webp' WHEN 'heic' THEN 'image/heic'
    WHEN 'heif' THEN 'image/heif' WHEN 'pdf' THEN 'application/pdf' WHEN 'doc' THEN 'application/msword'
    WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN 'txt' THEN 'text/plain' ELSE NULL END
WHERE "mimeType" IS NULL;

UPDATE "report_attachments" SET "mimeType" = CASE lower(substring("fileName" from '\.([A-Za-z0-9]+)$'))
    WHEN 'jpg' THEN 'image/jpeg' WHEN 'jpeg' THEN 'image/jpeg' WHEN 'png' THEN 'image/png'
    WHEN 'gif' THEN 'image/gif' WHEN 'webp' THEN 'image/webp' WHEN 'heic' THEN 'image/heic'
    WHEN 'heif' THEN 'image/heif' ELSE NULL END
WHERE "mimeType" IS NULL;
