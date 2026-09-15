-- The logbook: what gets done to a thing, by whom, and when it is due again.
--
-- ⚠️ AN ENTRY IS AN `asset_money` ROW. The ledger is generalised rather than a
-- second table built beside it: every total, the expense queue, the receipt
-- link, the custody breakdown and the phone's "add a receipt" already read this
-- table, and a parallel `asset_log_entries` would have needed every one of them
-- taught to read two tables and add them up — the classic way two totals of the
-- same money come to disagree. A Fuel entry is a row with an amount AND a
-- litres/odometer reading; a Damage entry is a row whose amount is 0.
--
-- NULL `logType` is the Cost log, which is every row that exists today. Nothing
-- is rewritten: amountCents, direction, category, status and receipt* keep
-- meaning exactly what they meant.
--
-- Additive and idempotent: the shadow database is broken here, so migrations
-- are hand-authored and must be safe to re-run.

ALTER TABLE "asset_money" ADD COLUMN IF NOT EXISTS "logType" TEXT;
ALTER TABLE "asset_money" ADD COLUMN IF NOT EXISTS "values" JSONB;
ALTER TABLE "asset_money" ADD COLUMN IF NOT EXISTS "readings" JSONB;

-- "When was this last done": one type's newest entry on one asset.
CREATE INDEX IF NOT EXISTS "asset_money_assetId_logType_occurredAt_idx"
    ON "asset_money"("assetId", "logType", "occurredAt");

-- Derived on every write, so a record page and the sweep read one row.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "logState" JSONB;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "logRemindAt" TIMESTAMP(3);

-- The sweep's whole query is "logRemindAt <= now". Nulls are the vast majority
-- and are never asked for.
CREATE INDEX IF NOT EXISTS "assets_logRemindAt_idx" ON "assets"("logRemindAt");

-- Reminders already said, one per (asset, type, window, stage). The unique
-- index IS the claim: a second replica or a re-run inserts nothing and says
-- nothing.
CREATE TABLE IF NOT EXISTS "asset_log_reminders" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId"        TEXT NOT NULL,
    "logType"        TEXT NOT NULL,
    "windowKey"      TEXT NOT NULL,
    "stage"          TEXT NOT NULL,
    "sentAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_log_reminders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "asset_log_reminders_assetId_logType_windowKey_stage_key"
    ON "asset_log_reminders"("assetId", "logType", "windowKey", "stage");

DO $$ BEGIN
    ALTER TABLE "asset_log_reminders"
        ADD CONSTRAINT "asset_log_reminders_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
