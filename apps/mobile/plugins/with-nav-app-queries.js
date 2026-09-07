const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Let the route planner ask Android which map apps are installed.
 *
 * ⚠️ Since Android 11 an app can only see other packages it declares an
 * interest in. Without this block `Linking.canOpenURL('waze://')` returns
 * false on every device, installed or not — the same silent "no" iOS gives for
 * a scheme missing from LSApplicationQueriesSchemes.
 *
 * Declaring an intent to VIEW these schemes is the narrow form: it grants
 * visibility of apps that handle exactly these links, not the QUERY_ALL_PACKAGES
 * permission, which Google Play requires a justification for and would refuse
 * here.
 *
 * ⚠️ NATIVE CONFIG. It takes effect in a BUILD, never in an over-the-air
 * update. An OTA that reaches an older binary finds nothing and falls back to
 * opening the universal link — degraded, not broken, by design.
 */
const SCHEMES = ['comgooglemaps', 'waze', 'geo'];

module.exports = function withNavAppQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries || [];

    // One queries block, extended rather than replaced: other plugins add
    // their own entries here and clobbering them breaks their detection.
    let block = manifest.queries[0];
    if (!block) {
      block = {};
      manifest.queries.push(block);
    }
    block.intent = block.intent || [];

    for (const scheme of SCHEMES) {
      const already = block.intent.some(
        (i) => i?.data?.some?.((d) => d?.$?.['android:scheme'] === scheme),
      );
      if (already) continue;
      block.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': scheme } }],
      });
    }
    return cfg;
  });
};
