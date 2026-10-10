/**
 * downscaleImage — the long edge is bounded, portrait or landscape, and
 * nothing is ever enlarged.
 */
type Size = { width: number; height: number };
let source: Size = { width: 0, height: 0 };
const resizes: Array<{ width?: number; height?: number }> = [];
const saves: Array<{ compress?: number; format?: string }> = [];

function ref(size: Size) {
  return {
    ...size,
    saveAsync: async (o: { compress?: number; format?: string }) => {
      saves.push(o);
      return { uri: `file://out-${size.width}x${size.height}.jpg`, ...size };
    },
  };
}
function context(size: Size) {
  return {
    resize(r: { width?: number; height?: number }) {
      resizes.push(r);
      const ratio = r.width ? r.width / size.width : (r.height as number) / size.height;
      return context({ width: Math.round(size.width * ratio), height: Math.round(size.height * ratio) });
    },
    renderAsync: async () => ref(size),
  };
}
let present = true;
jest.mock('../../offline/native', () => ({
  loadImageManipulator: () =>
    present
      ? {
          SaveFormat: { JPEG: 'jpeg' },
          ImageManipulator: { manipulate: (src: string | Size) => context(typeof src === 'string' ? source : { width: src.width, height: src.height }) },
        }
      : null,
}));

import { downscaleImage, longEdgeResize } from '../downscale-image';

beforeEach(() => { resizes.length = 0; saves.length = 0; present = true; });

describe('longEdgeResize', () => {
  it('bounds the WIDTH of a landscape photo', () => expect(longEdgeResize(4032, 3024, 2200)).toEqual({ width: 2200 }));
  it('bounds the HEIGHT of a portrait page — the width-only bug', () => expect(longEdgeResize(3024, 4032, 2200)).toEqual({ height: 2200 }));
  it('a square uses the width', () => expect(longEdgeResize(3000, 3000, 2048)).toEqual({ width: 2048 }));
  it('never enlarges', () => {
    expect(longEdgeResize(1200, 1600, 2200)).toBeNull();
    expect(longEdgeResize(2200, 1000, 2200)).toBeNull();
  });
  it('an unknown size is left alone', () => expect(longEdgeResize(0, 0, 2200)).toBeNull());
});

describe('downscaleImage', () => {
  it('portrait: the long edge comes out at the bound', async () => {
    source = { width: 3024, height: 4032 };
    const out = await downscaleImage('file://in.heic', { maxEdge: 2200, quality: 0.75 });
    expect(resizes).toEqual([{ height: 2200 }]);
    expect(Math.max(out!.width, out!.height)).toBe(2200);
    expect(out!.width).toBe(1650);
    expect(saves).toEqual([{ compress: 0.75, format: 'jpeg' }]);
  });

  it('landscape: the long edge comes out at the bound', async () => {
    source = { width: 4032, height: 3024 };
    const out = await downscaleImage('file://in.jpg', { maxEdge: 2048, quality: 0.8 });
    expect(resizes).toEqual([{ width: 2048 }]);
    expect(out).toMatchObject({ width: 2048, height: 1536 });
  });

  it('a small photo is re-encoded, never enlarged', async () => {
    source = { width: 800, height: 1200 };
    const out = await downscaleImage('file://small.jpg', { maxEdge: 2200, quality: 0.75 });
    expect(resizes).toEqual([]);
    expect(out).toMatchObject({ width: 800, height: 1200 });
  });

  it('no manipulator in this build: null, the caller keeps the original', async () => {
    present = false;
    expect(await downscaleImage('file://in.jpg', { maxEdge: 2200, quality: 0.75 })).toBeNull();
  });
});
