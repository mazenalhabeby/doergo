-- When the sender wrote a chat message, as their phone recorded it.
--
-- A message written in a basement at 09:12 and delivered at 11:15 is shown as
-- written at 09:12; createdAt stays the server's receipt time. Null for every
-- message sent online (and all before this), where the two are the same moment.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
