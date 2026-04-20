# Google Maps API key rotation — required before first store release

## Why this matters

`apps/mobile/app.json` currently hard-codes the Google Maps API key:

```
ios.config.googleMapsApiKey:        AIzaSyB9kTVMPalfoDoW-7V_J8F2ZjOSnApQAqM
android.config.googleMaps.apiKey:   AIzaSyB9kTVMPalfoDoW-7V_J8F2ZjOSnApQAqM
```

That value is in the **public** GitHub repo (`mazenalhabeby/doergo`) and in
the git history. A leaked Maps key with no restrictions can be abused by anyone
on the internet to bill the project's Google Cloud account. Even if Google
catches the abuse and disables it, you may still be on the hook for a partial
month of usage.

This document is a 15-minute fix. Do it before the first store submission.

---

## Step 1 — Create a fresh, restricted key

1. Open the Google Cloud Console:
   <https://console.cloud.google.com/apis/credentials>
   (use the project that contains the **HBCField** Maps SDK enrollment)

2. Click **+ CREATE CREDENTIALS → API key**. Copy the new value somewhere safe
   (we'll call it `NEW_KEY` below).

3. With the new key still selected, click **Edit API key** and configure
   restrictions:

   ### Application restrictions (TWO keys, one per platform)

   You actually need **two** keys — one for iOS, one for Android — because
   their restriction modes are different.

   **iOS key**
   - *Application restrictions*: **iOS apps**
   - *Add iOS bundle identifier*: `eu.hbc-group.hbcfield`

   **Android key**
   - *Application restrictions*: **Android apps**
   - *Add an item*:
     - Package name: `eu.hbcgroup.hbcfield`
     - SHA-1 certificate fingerprint: see below
   - Add the **debug** SHA-1 too while developing (so `expo run:android`
     works locally), then add the **production** SHA-1 once the release
     keystore exists.

   ### How to get the SHA-1 fingerprint

   For an **EAS-managed** Android build (the project uses EAS):

   ```bash
   cd apps/mobile
   eas credentials
   # → choose Android → production → "View credentials"
   # → copy the "SHA1 Fingerprint" value
   ```

   For your **local debug** key (only needed during development):

   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore \
           -alias androiddebugkey -storepass android -keypass android \
           | grep SHA1
   ```

   ### API restrictions
   For both keys, restrict the API list to **only** what the app uses:
   - Maps SDK for Android (Android key) / Maps SDK for iOS (iOS key)
   - Geocoding API (only if the app actively calls it)
   - Places API (only if the app actively calls it)

4. Save. Note the two key values: `NEW_IOS_KEY`, `NEW_ANDROID_KEY`.

---

## Step 2 — Move the keys out of the repo, into EAS secrets

```bash
cd apps/mobile

# Store the keys as EAS Secrets so they never enter the repo
eas secret:create --scope project --name GOOGLE_MAPS_IOS_KEY     --value NEW_IOS_KEY
eas secret:create --scope project --name GOOGLE_MAPS_ANDROID_KEY --value NEW_ANDROID_KEY
```

---

## Step 3 — Read the keys at build time

Replace the hard-coded `app.json` with a dynamic `app.config.ts` that reads
from `process.env`. Drop this file at `apps/mobile/app.config.ts`:

```ts
import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "HBCField",
  slug: "doergo",
  // …copy the rest of the static fields from app.json…
  ios: {
    ...(config.ios ?? {}),
    bundleIdentifier: "eu.hbc-group.hbcfield",
    buildNumber: "1",
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY,
    },
    // …infoPlist, supportsTablet, etc.…
  },
  android: {
    ...(config.android ?? {}),
    package: "eu.hbcgroup.hbcfield",
    versionCode: 1,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY,
      },
    },
    // …adaptiveIcon, googleServicesFile, permissions…
  },
});
```

Then **delete** `apps/mobile/app.json` (Expo prefers `app.config.ts` if both
exist, but having both is confusing).

EAS will inject the secret values at build time so the keys end up baked into
the binary — but never into the repo or the user's `.env`.

---

## Step 4 — Disable / delete the leaked key

Back in <https://console.cloud.google.com/apis/credentials>:

1. Find the key starting with `AIzaSyB9kT…ApQAqM` (the leaked one).
2. Click the trash icon. Confirm.

This is the only step that actually closes the door. The leak history in git
remains, but any abuse using that key now fails.

---

## Step 5 — Verify

```bash
cd apps/mobile
eas build --platform all --profile preview
# Install the resulting build on a device and confirm the map screens still
# render tiles (Tracking → Live Map). If the keys are wrong, you'll see a
# "For development purposes only" watermark or a blank gray map.
```

---

## Optional: scrub git history

The leaked key is still visible in old commits at
<https://github.com/mazenalhabeby/doergo/blame/main/apps/mobile/app.json>.

Once Step 4 is complete, the key is dead and history scrubbing is optional. If
you want to do it anyway:

```bash
# WARNING: rewrites git history. Coordinate with anyone else on the repo.
git filter-repo --path apps/mobile/app.json --invert-paths
# …then re-add the cleaned app.config.ts and force-push.
```

Most teams skip this step because the key is already disabled.
