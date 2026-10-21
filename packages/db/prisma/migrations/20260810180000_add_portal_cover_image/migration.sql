-- Optional hero/background photo for the client portal home screen.
ALTER TABLE "portals" ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;
