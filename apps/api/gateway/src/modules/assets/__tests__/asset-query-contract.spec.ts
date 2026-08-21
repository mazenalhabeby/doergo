import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AssetQueryDto } from '../dto';

/**
 * What GET /assets accepts.
 *
 * The global pipe runs with `forbidNonWhitelisted: true`, so a query parameter
 * the DTO does not declare is a 400 — not an ignored extra. That makes removing
 * a field from this DTO a BREAKING change for anyone still sending it, and the
 * break is invisible in review: the server compiles, the client compiles, and
 * the list just comes back empty.
 *
 * It has already happened. `topLevel` was removed here when assets stopped
 * nesting, while the space's asset list went on sending `topLevel=true` — every
 * type opened to "nothing inside" while its card still counted four.
 *
 * So the accepted set is pinned. Changing it should mean editing this list and
 * going to look at who sends it.
 */
const ACCEPTED = ['categoryId', 'typeId', 'status', 'search', 'page', 'limit'] as const;

describe('the GET /assets query contract', () => {
  it('accepts every parameter a caller is allowed to send', () => {
    const query: Record<string, string> = {
      categoryId: 'cat_1',
      typeId: 'type_1',
      status: 'ACTIVE',
      search: 'press',
      page: '2',
      limit: '20',
    };
    // The list and the sample must not drift apart either.
    expect(Object.keys(query).sort()).toEqual([...ACCEPTED].sort());

    const errors = validateSync(plainToInstance(AssetQueryDto, query, { enableImplicitConversion: true }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toEqual([]);
  });

  it('rejects anything else, which is why the list above matters', () => {
    const errors = validateSync(plainToInstance(AssetQueryDto, { topLevel: 'true' }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((e) => e.property)).toContain('topLevel');
  });
});
