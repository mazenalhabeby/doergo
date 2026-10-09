-- Additive. Access tokens issued before "tokensValidAfter" are refused, which is
-- what makes a password change, a reset, a deactivation or "sign out everywhere"
-- end the sessions that already hold an access token (refresh tokens were
-- already deleted at those moments; access tokens lived on until expiry).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokensValidAfter" TIMESTAMP(3);

-- Operator console: the last accepted TOTP step (replay guard) and the same
-- session cut-off for operators.
ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "twoFactorLastStep" INTEGER;
ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "tokensValidAfter" TIMESTAMP(3);
