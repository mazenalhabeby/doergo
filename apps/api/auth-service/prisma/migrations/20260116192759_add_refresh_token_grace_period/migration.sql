-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "cachedAccessToken" TEXT,
ADD COLUMN     "replacedByTokenHash" TEXT,
ADD COLUMN     "usedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "refresh_tokens_usedAt_idx" ON "refresh_tokens"("usedAt");
