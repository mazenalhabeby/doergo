/**
 * Just enough expo-image-manipulator for rule tests.
 *
 * `page-upload.ts` imports it at the top level for the compression step, but
 * the rules these specs cover — page order, what may be submitted, reordering —
 * never reach it. Stubbed for the same reason react-native is (see
 * jest.config.js): these files are deliberately native-free TypeScript.
 */
module.exports = {
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  manipulateAsync: async (uri) => ({ uri, width: 0, height: 0 }),
};
