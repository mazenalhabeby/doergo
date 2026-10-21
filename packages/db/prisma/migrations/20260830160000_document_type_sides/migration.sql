-- Which sides of the document are worth photographing.
--
-- The scanner was asking for both sides whenever the type was a credential,
-- which is wrong in both directions: a gas certificate is a credential with
-- nothing on its back, and a passport carries its machine-readable zone on the
-- photo page — asking somebody to turn a passport over produces a picture of a
-- blank cover.
--
-- It is a property of the DOCUMENT, not of what the document proves. European
-- ID cards and driving licences carry the zone and the categories on the back;
-- passports and paper certificates do not.

ALTER TABLE "document_types" ADD COLUMN IF NOT EXISTS "twoSided" BOOLEAN NOT NULL DEFAULT false;
