-- Additive: what an item was judged on at its last approval, so the inbox reads the rules as the gate does.
ALTER TABLE "approval_steps" ADD COLUMN "facts" JSONB;
