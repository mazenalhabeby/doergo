-- Who may see documents of a given type.
--
-- Additive, and a no-op for everything that exists: an empty list means NO
-- restriction, so every type keeps behaving exactly as it does until somebody
-- names roles on it. The opposite default would empty every register in every
-- organization the moment this deployed.
--
-- Hand-authored and idempotent — the shadow database on this project is broken,
-- so `migrate dev` is never used and every statement must survive a re-run.

ALTER TABLE "document_types"
  ADD COLUMN IF NOT EXISTS "visibleToRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
