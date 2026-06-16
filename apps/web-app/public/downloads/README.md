# App downloads

The `/download` page serves the Android APK from here **only** when
`NEXT_PUBLIC_ANDROID_APK_URL` is unset (it defaults to `/downloads/hbcfield.apk`).

Two ways to host the Android build:

1. **Self-host (this folder)** — drop the EAS-built APK here as `hbcfield.apk`:
   ```
   apps/web-app/public/downloads/hbcfield.apk
   ```
   The default download link then just works. Re-copy the file on each release.

2. **EAS-hosted URL (recommended, no redeploy per build)** — set the env var to
   the URL `eas build` prints, so swapping builds never touches the repo:
   ```
   NEXT_PUBLIC_ANDROID_APK_URL=https://expo.dev/artifacts/eas/xxxx.apk
   ```

Build the APK (points at the production API via the `production-apk` profile):
```
cd apps/mobile
eas build --platform android --profile production-apk
```
