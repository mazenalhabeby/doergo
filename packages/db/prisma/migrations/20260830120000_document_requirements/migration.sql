-- What the organization REQUIRES from its members.
--
-- Until now a document type only said what a document is. Whether anybody was
-- supposed to have one was implicit — so the compliance board could list every
-- certificate on file and still be silent about the technician who had never
-- uploaded anything at all. A missing document is invisible to a board built
-- from documents; it only becomes visible once the requirement is a record in
-- its own right.
--
-- Two columns, both on the type:
--
--   requiredFromAll      every member must provide one
--   requiredFromRoleIds  only members holding one of these roles must
--
-- Empty and false means "we accept it if you send it", which is what every
-- existing SUPPLIED type means today — so this is additive in behaviour as well
-- as in schema.

ALTER TABLE "document_types" ADD COLUMN IF NOT EXISTS "requiredFromAll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "document_types" ADD COLUMN IF NOT EXISTS "requiredFromRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
