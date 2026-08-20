import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { UpdateAssetDto, CreateAssetDto, AssetDetailRowDto } from '../dto/asset.dto';

/**
 * The global pipe runs with transform + enableImplicitConversion. An array
 * property whose element type it cannot see gets each element coerced to the
 * declared type — which silently turned `{ label, value }` into `[]`. The
 * request still validated, still returned 200, and stored an array of empty
 * arrays. Nothing errored; the field just never existed.
 *
 * These tests use the SAME options as main.ts, so they fail if the element type
 * is ever dropped again.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

describe('asset details survive the validation pipe', () => {
  it('rebuilds each row as a real AssetDetailRowDto', async () => {
    // The value assertions below passed even while the bug was live, because
    // ts-jest does not emit the same design:type metadata the built gateway
    // does. THIS is the assertion that actually pins the fix: without
    // `@Type(() => AssetDetailRowDto)` the elements stay plain objects, and it
    // was precisely that missing element type which let the running server
    // coerce `{ label, value }` into `[]`.
    const out: any = await pipe.transform(
      { details: [{ label: 'Door code', value: '1234' }] },
      { type: 'body', metatype: UpdateAssetDto },
    );
    expect(out.details).toHaveLength(1);
    expect(out.details[0]).toBeInstanceOf(AssetDetailRowDto);
    expect(out.details[0].label).toBe('Door code');
    expect(out.details[0].value).toBe('1234');
  });

  it('keeps rows on create too', async () => {
    const out: any = await pipe.transform(
      { name: 'Flat 3B', details: [{ label: 'Floor', value: '3' }, { label: 'Rent', value: '900' }] },
      { type: 'body', metatype: CreateAssetDto },
    );
    expect(out.details.map((d: any) => d.label)).toEqual(['Floor', 'Rent']);
  });

  it('keeps a prompted field that has not been answered yet', async () => {
    // An empty value is meaningful: the field was asked for and left blank.
    const out: any = await pipe.transform(
      { details: [{ label: 'Floor', value: '' }] },
      { type: 'body', metatype: UpdateAssetDto },
    );
    expect(out.details[0]).toMatchObject({ label: 'Floor', value: '' });
  });

  it('rejects a row with no label rather than storing a nameless box', async () => {
    await expect(
      pipe.transform({ details: [{ value: 'orphan' }] }, { type: 'body', metatype: UpdateAssetDto }),
    ).rejects.toBeDefined();
  });
});
