# EAS Submit – iOS / Android setup

`eas.json` → `submit.production.ios` currently contains placeholders
(`REPLACE_WITH_*`). This file explains where to find each value before you can
run `eas submit --platform ios --profile production`.

---

## iOS

### `appleId`
The email address of the Apple ID enrolled in the **HBC GmbH** Apple Developer
team. This is the account that will sign and upload the build.

- Where to find it: <https://appleid.apple.com> → the email at the top of the
  page.
- Example shape: `appstore@hbc-group.eu`

### `appleTeamId`
The 10-character alphanumeric Team ID for HBC GmbH on the Apple Developer
program. Required so EAS picks the right signing identity.

- Where to find it: <https://developer.apple.com/account> → Membership details
  → "Team ID".
- Example shape: `A1B2C3D4E5`

### `ascAppId`
The numeric **App Store Connect** app ID. This **only exists after** someone
creates the app record in App Store Connect (see step below).

- Where to find it: <https://appstoreconnect.apple.com/apps> → click the app →
  the URL becomes `…/apps/<numericId>/…` — that number is `ascAppId`. It's also
  shown under "App Information" → "Apple ID".
- Example shape: `6469123456`

### One-time: create the App Store Connect record
1. Sign in to <https://appstoreconnect.apple.com>.
2. **My Apps → ＋ → New App**.
3. Platform: **iOS**. Name: **HBCField**. Primary language: **English (US)**.
4. Bundle ID: pick `eu.hbc-group.hbcfield` from the dropdown. If it's not
   listed, register it first at
   <https://developer.apple.com/account/resources/identifiers/list>.
5. SKU: `hbcfield` (any unique internal id is fine).
6. Click **Create**.

The numeric ID appears in the URL — copy it into `ascAppId`.

---

## Android

### `serviceAccountKeyPath`
Currently `./play-store-key.json` (relative to `apps/mobile/`). The file is
git-ignored on purpose — never commit a service-account key.

### One-time: create the Google Play service account
1. <https://play.google.com/console> → **Setup → API access**.
2. Link or create a Google Cloud project.
3. Click **Create new service account**, follow the link to Google Cloud
   Console, create the service account with the **Service Account User** role,
   then create a **JSON key** for it.
4. Back in Play Console, **Grant access** to the service account with the
   **Admin (all permissions)** role for the HBCField app — or at minimum:
   *View app information*, *Manage production releases*, *Manage testing-track
   releases*, *Manage store presence*.
5. Save the downloaded JSON as `apps/mobile/play-store-key.json`.

---

## Once both are set up

```bash
cd apps/mobile

# Build production AAB + iOS IPA
eas build --platform all --profile production

# Submit
eas submit --platform android --profile production
eas submit --platform ios --profile production
```
