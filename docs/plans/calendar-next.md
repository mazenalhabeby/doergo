# Calendar — next (parked 2026-10-07)

Mockups: https://claude.ai/artifact/R7iwKjhiR1HYK12H5q1KHb (row "Next — not built yet", boards 13–18).
Shipped before parking: four phone views, smart New (in person / online / phone), Job and Time off
open their own forms, leave approve in the calendar — PROD 9a93462a + OTA 1.0.7 79633856 / 1.0.6 0770aa78.

## Open items, in the order to build

1. **Outside guests by email** (boards 13–14)
   - Email itself already works: notification-service sends over SMTP (Nodemailer); every email is a
     shared template (`packages/shared/src/mail/email-templates.ts`, five languages, `email-catalogue-guard.spec.ts`).
   - To add: a `calendar_guests` table (eventId, email, name, locale, response, token hash), an
     invitation template + `.ics` attachment (shared `buildIcs`), signed Yes / Maybe / No links
     (public route, token = credential, same 404 rule as the feed), a re-send on a time change and
     a cancel email, the guest's time zone in the text.
   - Client contacts come from the CRM record (`CustomerContact`), typed emails need a permission.
   - **Decision needed:** who may invite outside guests — everyone, or a role permission
     (e.g. `canInviteGuests`)?
2. **Travel time** (board 15) — a drive block before/after an appointment with an address, from the
   previous place; "Time to leave" push; busy for colleagues. Uses the routes engine (Google → OSRM).
   **Decision needed:** on for everyone, or per person?
3. **Rooms** (board 16) — rooms per workspace (seats, equipment, active), pick in New, the server
   refuses a double booking. Gate: whoever manages the workspace.
4. **My usual meeting link** (board 17) — one link on the profile, offered in New › Online.
5. **Swipe on the phone** (board 18) — Month by month, Day / 3 days by days; pages already prefetched.
