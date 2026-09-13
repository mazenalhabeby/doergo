const { withAndroidManifest } = require('expo/config-plugins');

/**
 * The Android permissions biometric sign-in needs.
 *
 * ⚠️ WE OWN THIS BECAUSE THE LIBRARY'S OWN PLUGIN CANNOT BE LOADED.
 * `@sbaiahmed1/react-native-biometrics` ships an `app.plugin.js` and lists it in
 * `files`, but its `exports` map only exposes ".", "./types" and
 * "./package.json" — so Node refuses to resolve `./app.plugin.js`, Expo falls
 * back to the main export, and that throws `Unexpected token 'typeof'` while
 * resolving the config. Adding the package to `plugins` fails the build
 * outright. This is a packaging bug upstream, not a misconfiguration here.
 *
 * ⚠️ And without these permissions the failure is INVISIBLE, which is worse
 * than a build error: the library autolinks, compiles and typechecks, then
 * cannot prompt at runtime. `resolveCapability` catches that and reports
 * 'unavailable', every surface hides itself on 'unavailable', and the whole
 * feature renders nothing on a phone with a working fingerprint reader.
 *
 * Twenty lines we control beats a dependency on someone else's packaging for
 * something this load-bearing. If upstream fixes their `exports`, this can be
 * deleted and their plugin listed instead — it does the same three things.
 *
 * ⚠️ NATIVE CONFIG. It takes effect in a BUILD, never in an over-the-air
 * update. iOS is already covered by NSFaceIDUsageDescription in app.config.ts.
 */
const PERMISSIONS = [
  // Class 3 prompt on API 28+. The one that actually matters.
  'android.permission.USE_BIOMETRIC',
  // Deprecated since API 28, and still required for older devices to prompt
  // at all — this app's field users are not all on new phones.
  'android.permission.USE_FINGERPRINT',
];

module.exports = function withBiometricPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    /*
      De-duplicated on the way in: another plugin may ask for the same
      permission, and a manifest carrying it twice is rejected by some Play
      Store checks.
    */
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    for (const name of PERMISSIONS) {
      const already = manifest['uses-permission'].some(
        (p) => p?.$?.['android:name'] === name,
      );
      if (!already) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }

    return cfg;
  });
};
