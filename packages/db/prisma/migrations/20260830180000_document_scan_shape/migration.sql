-- The shape the scanner draws its frame in.
--
-- The frame was ID-1 for everything: 85.6 x 54 mm, the size of a driving
-- licence. A passport data page is ID-3 — 125 x 88 mm — and the two ratios are
-- 1.59 and 1.42, which is far enough apart that a passport in a card frame
-- either overflows the sides or gets held further away.
--
-- That is not a cosmetic problem. Holding it further away makes the
-- machine-readable zone smaller in the captured image, and the size of the zone
-- in pixels is the single biggest determinant of whether the OCR can read it.
-- The frame is therefore part of the accuracy of the whole feature.
--
-- Three shapes cover the documents this product files: a card, a passport page,
-- and a sheet of paper.

ALTER TABLE "document_types"
  ADD COLUMN IF NOT EXISTS "scanShape" TEXT NOT NULL DEFAULT 'CARD';
