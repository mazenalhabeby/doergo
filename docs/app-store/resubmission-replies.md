# App Store — Resubmission Kit (build 10, v1.0.0)

Build 10 (commit `e8db607`) has been uploaded to App Store Connect and processed. Below are the
copy-paste replies for the App Review Resolution Center and the checklist to resubmit.

---

## 1. Account deletion — Guideline 5.1.1(v)

**What Apple wants:** proof that a user can initiate account deletion from *inside* the app.
The feature already ships. Paste this into the Resolution Center reply:

> Thank you for the review. HBCField supports in-app account deletion. A signed-in user can
> permanently delete their account here:
>
> 1. Open the app and sign in.
> 2. Tap the **Profile** tab (bottom navigation).
> 3. Tap **Account & Security**.
> 4. Scroll to the **Delete Account** section and tap **Delete My Account**.
> 5. Enter the account password to confirm, then tap **Delete Account**.
> 6. A final confirmation dialog ("Delete Account?") appears; tapping **Delete Account** permanently
>    deletes the account, anonymizes associated data, and signs the user out.
>
> Deletion is immediate and irreversible — it is not a "request" flow. No re-authentication support
> ticket or email is required.

**Reviewer demo account** (must be able to reach the whole app — a mobile-capable technician):
- Email / password: *(the TECHNICIAN + HYBRID demo account you created on production)*
- Note in "App Review Information → Notes": "This demo account can be safely deleted to test 5.1.1(v);
  it will be recreated on our side."

Code reference (for our own record, not for Apple):
`apps/mobile/app/(app)/profile/account.tsx` → `handleDeleteAccount()` → `accountApi.deleteAccount(password)`.

---

## 2. Background location — Guideline 2.5.4

**What Apple wants:** a clear justification for the `location` background mode and that the usage
string matches real behavior. Paste this:

> HBCField is a field-service platform for mobile technicians. Background location is used for two
> job-critical purposes, both initiated by an explicit user action and clearly disclosed:
>
> 1. **Route recording while en route to a job.** When a technician marks an assigned task as
>    "En Route" (on the way to the customer site), the app records the travel route in the background
>    so the office can see the actual path taken and arrival time. Recording stops automatically when
>    the technician arrives (marks "Arrived") or ends the task.
>
> 2. **Work-site verification while clocked in.** For on-site staff, the app confirms the technician
>    remains within the assigned work-site geofence while clocked in. This stops automatically when
>    the technician clocks out.
>
> Background location never runs unless the technician has explicitly started one of these actions.
> This is reflected in our `NSLocationAlwaysAndWhenInUseUsageDescription` string. The app requests
> "When In Use" first and only requests "Always" in-context, with an in-app explanation screen, before
> any background collection begins.

The Info.plist strings are already correct in `apps/mobile/app.config.ts`:
- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription` (route + geofence, "stops automatically when you arrive or clock out")
- `UIBackgroundModes: ['remote-notification', 'location']`

---

## 3. Screenshots

- **6.9" iPhone** (1290 × 2796): `screenshots/iphone-6.9-en-es/` — 18 shots (EN + ES). Upload these to the
  6.9" display slot in App Store Connect. (The 6.9" set also satisfies the 6.5"/6.1" requirement via scaling.)
- **13" iPad** (2064 × 2752): `screenshots/ipad-13-en/` — 7 shots. Upload to the iPad 13" slot
  (required because `supportsTablet: true`).
- Verify none of the screenshots contain pricing text, "beta", placeholder/lorem content, or a status bar
  that shows a carrier/debug string.

---

## 4. Metadata / pricing

- Confirm no price is mentioned in the app description, screenshots, or What's New (in-app purchase /
  subscription pricing is managed by Stripe on the web, not through Apple IAP — so App Store metadata must
  not advertise prices or external purchase links per 3.1.1 unless using the External Purchase entitlement).
- App privacy → confirm "Location" is declared with the correct purposes.

---

## 5. Resubmit checklist (App Store Connect)

- [ ] Attach **build 10** to the app version.
- [ ] Upload iPhone 6.9" + iPad 13" screenshots.
- [ ] Set the reviewer demo account (TECHNICIAN + HYBRID) + notes.
- [ ] Paste reply #1 (account deletion) and reply #2 (background location) in the Resolution Center.
- [ ] Confirm no pricing in metadata.
- [ ] Submit for review.

---

### Note on a demo video
A screen recording is **not required** to resolve 5.1.1(v) — the written path above is what Apple asks for,
and it's the standard resolution. The only build installable on the local iOS Simulator here is a
development client (it shows React Native dev chrome), which would make poor review footage, so we are not
attaching a video. If a reviewer later insists on one, we can capture it from a TestFlight build on a real
device.
