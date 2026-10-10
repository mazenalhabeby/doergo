import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateDocumentTypeDto } from '../dto/documents.dto';

/**
 * The update DTO is DERIVED from the create DTO (PartialType ∘ OmitType), so a
 * field added to a type exists once — the copy it replaced is how `multiPage`
 * shipped broken (declared on create, missing on update, refused by
 * `forbidNonWhitelisted`). These pin what the derivation must keep true, with
 * the gateway's own pipe options.
 */
const opts = { whitelist: true, forbidNonWhitelisted: true };
const check = async (payload: Record<string, unknown>) =>
  validate(plainToInstance(UpdateDocumentTypeDto, payload), opts);

describe('UpdateDocumentTypeDto', () => {
  it('accepts an empty update — every field is optional', async () => {
    expect(await check({})).toEqual([]);
  });

  it('accepts the fields an edit sends, including the update-only isActive', async () => {
    expect(
      await check({
        label: 'Driving licence',
        retentionMonths: 24,
        multiPage: true,
        visibleToRoleIds: ['r1'],
        isActive: false,
        position: 2,
      }),
    ).toEqual([]);
  });

  it('still validates what it inherits', async () => {
    expect(await check({ retentionMonths: 601 })).not.toEqual([]);
    expect(await check({ label: '' })).not.toEqual([]);
  });

  it.each(['key', 'cadence', 'direction'])('refuses %s — changing it would re-interpret every filed document', async (field) => {
    const errors = await check({ [field]: field === 'key' ? 'x' : 'ONCE' });
    expect(errors.map((e) => e.property)).toContain(field);
  });
});
