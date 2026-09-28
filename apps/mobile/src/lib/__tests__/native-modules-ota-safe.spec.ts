import { execSync } from 'child_process';
import path from 'path';

/*
  ⚠️ A NATIVE MODULE ADDED AFTER THE LAST STORE BUILD MUST NEVER BE IMPORTED
  AT THE TOP OF A FILE.

  An OTA carries JavaScript only. The 1.0.6 binary on people's phones has no
  ExpoHaptics, and `import * as Haptics from 'expo-haptics'` throws while the
  module loads — the island imported it that way, and publishing that bundle
  would have crashed every 1.0.6 app on launch. `lib/haptics.ts` requires it
  lazily inside a try, so an older binary simply has no vibration.
*/
const ROOT = path.resolve(__dirname, '../../..');
const LAZY_ONLY = ['expo-haptics'];

describe('native modules newer than the store build are loaded lazily', () => {
  it.each(LAZY_ONLY)('%s is imported by nothing but its wrapper', (mod) => {
    const hits = execSync(`grep -rlE "from '${mod}'|import\\('${mod}'\\)" src app || true`, { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean).filter((f) => !f.includes('__tests__'));
    expect(hits).toEqual([]);
  });
});
