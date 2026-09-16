const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Say, in the manifest, that this app resizes and rotates on a large screen.
 *
 * ⚠️ Google Play flags the bundle with "Einschränkungen für die Größenänderung
 * und Ausrichtung in deiner App entfernen, um Geräte mit großen Displays zu
 * unterstützen". Its large-screen check reads the MANIFEST, and the manifest
 * Expo generates says nothing either way: `android:resizeableActivity` is
 * absent. Absent is not the same as declared — the platform default depends on
 * targetSdk and is therefore something Play cannot rely on, so it asks for the
 * statement. This plugin makes it.
 *
 * The product already means this. `orientation: 'default'` in app.config.ts
 * gives MainActivity `android:screenOrientation="unspecified"`, iPad carries a
 * full landscape set in its infoPlist, and src/lib/responsive.ts recomputes
 * every layout value from useWindowDimensions() so rotation and window resizing
 * are handled rather than tolerated. The manifest was the only place that had
 * not been told.
 *
 * WHAT THIS DOES NOT CHANGE: phones stay portrait. That lock lives in
 * src/lib/orientation.ts, is applied at RUNTIME from the shortest screen side,
 * and deliberately does not reach tablets or unfolded foldables — which are
 * precisely the devices Play is asking about. A manifest-level portrait lock
 * would have been the thing to remove; there has never been one.
 *
 * ⚠️ `screenOrientation` is asserted rather than assumed. If a library's
 * manifest merge, or a future change to the `orientation` key, ever puts a
 * locked value on MainActivity, Play's warning comes back and nothing in the
 * app would look different on the phones anybody here tests on. Failing that
 * way silently is what this guard exists to stop.
 *
 * ⚠️ NATIVE CONFIG. It takes effect in a BUILD, never in an over-the-air
 * update, and whether Play's warning clears can only be seen after an upload.
 */

/** Orientation values that PIN the activity and would trip Play's check. */
const LOCKED_ORIENTATIONS = new Set([
  'portrait',
  'reversePortrait',
  'sensorPortrait',
  'userPortrait',
  'landscape',
  'reverseLandscape',
  'sensorLandscape',
  'userLandscape',
  'locked',
  'nosensor',
]);

module.exports = function withLargeScreenSupport(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest?.application?.[0];
    if (!application) return cfg;

    application.$ = application.$ || {};

    /*
      Declared on <application> rather than on each activity so it covers the
      ones this app does not own — expo-image-picker's cropper, the ML Kit
      scanner delegate — which inherit it unless they state otherwise.
    */
    application.$['android:resizeableActivity'] = 'true';

    /*
      Lets the system hand the app a resized window instead of restarting the
      activity for it. Without this a fold, an unfold or a split-screen drag
      tears down and rebuilds the screen: on this app that means a member loses
      a half-written service report mid-shift.
    */
    for (const activity of application.activity || []) {
      const name = activity?.$?.['android:name'];
      if (name !== '.MainActivity' && !String(name).endsWith('.MainActivity')) continue;

      const orientation = activity.$['android:screenOrientation'];
      if (orientation && LOCKED_ORIENTATIONS.has(orientation)) {
        activity.$['android:screenOrientation'] = 'unspecified';
      }

      /*
        `screenLayout|smallestScreenSize|density` are the configuration changes
        a fold or a resize actually reports. Expo's template already lists
        orientation and screenSize; adding the rest is what makes the window
        change arrive as a prop update rather than an activity recreation.
      */
      const existing = (activity.$['android:configChanges'] || '').split('|').filter(Boolean);
      for (const change of ['screenLayout', 'smallestScreenSize', 'density']) {
        if (!existing.includes(change)) existing.push(change);
      }
      activity.$['android:configChanges'] = existing.join('|');
    }

    return cfg;
  });
};
