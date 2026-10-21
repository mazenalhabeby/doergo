-- Device keys: a phone that can sign in without a password.
--
-- Additive and idempotent. Holds PUBLIC keys only — the private half never
-- leaves the Secure Enclave / StrongBox, so this table is not a secret store
-- and a dump of it grants nothing.
--
-- ⚠️ Hand-authored with IF NOT EXISTS because the shadow database is broken on
-- this project; `prisma migrate dev` cannot be used to generate it.

CREATE TABLE IF NOT EXISTS "device_keys" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "deviceId"       TEXT NOT NULL,
  "publicKey"      TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "platform"       TEXT NOT NULL,
  "secureHardware" BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"     TIMESTAMP(3),
  "revokedAt"      TIMESTAMP(3),
  CONSTRAINT "device_keys_pkey" PRIMARY KEY ("id")
);

-- One key per device per member: re-enrolling the same phone replaces its key
-- rather than accumulating rows that all verify.
CREATE UNIQUE INDEX IF NOT EXISTS "device_keys_userId_deviceId_key"
  ON "device_keys"("userId", "deviceId");
CREATE INDEX IF NOT EXISTS "device_keys_userId_idx" ON "device_keys"("userId");

DO $$ BEGIN
  ALTER TABLE "device_keys"
    ADD CONSTRAINT "device_keys_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
