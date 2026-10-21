-- In-app support: tickets + conversation backbone. Idempotent/additive so it is
-- safe against prod schema drift.

DO $$ BEGIN CREATE TYPE "SupportStatus" AS ENUM ('OPEN','PENDING_AGENT','PENDING_CUSTOMER','RESOLVED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SupportCategory" AS ENUM ('BILLING','TECHNICAL','HOWTO','FEEDBACK','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SupportChannel" AS ENUM ('WEB','MOBILE','EMAIL','LIVE_CHAT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SupportAuthorType" AS ENUM ('CUSTOMER','AGENT','SYSTEM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "category" "SupportCategory" NOT NULL DEFAULT 'OTHER',
  "channel" "SupportChannel" NOT NULL DEFAULT 'WEB',
  "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
  "priority" INTEGER NOT NULL DEFAULT 4,
  "planTierAtCreation" TEXT,
  "assignedAgentId" TEXT,
  "slaFirstResponseDueAt" TIMESTAMP(3),
  "firstRespondedAt" TIMESTAMP(3),
  "slaBreached" BOOLEAN NOT NULL DEFAULT false,
  "lastCustomerMessageAt" TIMESTAMP(3),
  "lastAgentMessageAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT,
  "authorType" "SupportAuthorType" NOT NULL,
  "body" TEXT NOT NULL,
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "isInternalNote" BOOLEAN NOT NULL DEFAULT false,
  "readByCustomerAt" TIMESTAMP(3),
  "readByAgentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "support_tickets_organizationId_status_idx" ON "support_tickets"("organizationId","status");
CREATE INDEX IF NOT EXISTS "support_tickets_status_priority_createdAt_idx" ON "support_tickets"("status","priority","createdAt");
CREATE INDEX IF NOT EXISTS "support_tickets_assignedAgentId_status_idx" ON "support_tickets"("assignedAgentId","status");
CREATE INDEX IF NOT EXISTS "support_tickets_slaBreached_slaFirstResponseDueAt_idx" ON "support_tickets"("slaBreached","slaFirstResponseDueAt");
CREATE INDEX IF NOT EXISTS "support_messages_ticketId_createdAt_idx" ON "support_messages"("ticketId","createdAt");

DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
