-- Platform staff (company super-admins). Isolated from customer users.
CREATE TABLE IF NOT EXISTS "platform_users" (
  "id"                  TEXT NOT NULL,
  "email"               TEXT NOT NULL,
  "passwordHash"        TEXT NOT NULL,
  "firstName"           TEXT NOT NULL,
  "lastName"            TEXT NOT NULL,
  "role"                TEXT NOT NULL DEFAULT 'SUPPORT',
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "twoFactorSecret"     TEXT,
  "twoFactorEnabled"    BOOLEAN NOT NULL DEFAULT false,
  "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"         TIMESTAMP(3),
  "lastLoginAt"         TIMESTAMP(3),
  "createdById"         TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "platform_users_email_key" ON "platform_users"("email");
