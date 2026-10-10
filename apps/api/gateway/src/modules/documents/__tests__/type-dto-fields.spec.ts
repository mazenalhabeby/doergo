import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from '../dto/documents.dto';

/*
  ⚠️ A document-type field is not wired until the DTO declares it.

  The gateway validates with `forbidNonWhitelisted`, so a property the DTO does
  not name is not ignored — the whole request is REFUSED, with a message the
  member reads as a bug in the page they are looking at.

  `multiPage` shipped exactly that way: on the Prisma model, in auth-service's
  create and update, on the phone and in the web editor — and absent from these
  two DTOs. Everything typechecked, every test passed, and saving a type
  answered "property multiPage should not exist". Nothing else in the codebase
  could have caught it, because each half was correct on its own.

  Two failures are possible and this covers both: a field added to neither DTO,
  and a field added to one of the pair. Create and update are parallel by
  design, and the second is the easier mistake — the create form is the one
  people test.
*/

/*
  Asked of the classes' real validation (the gateway's own pipe options), not of
  their source text: UpdateDocumentTypeDto is DERIVED from the create DTO now
  (PartialType ∘ OmitType), so "a field on only one of the pair" can no longer
  be written — but "a field on neither" still can, and the create-only rule must
  still hold.
*/
const PIPE = { whitelist: true, forbidNonWhitelisted: true };
const REQUIRED_ON_CREATE = { key: 'licence', label: 'Driving licence' };

/** A value of the right shape for each field, so only "is it declared?" is asked. */
const SAMPLE: Record<string, unknown> = {
  signerRoute: [{ role: 'MEMBER' }, { role: 'RESPONSIBLE' }],
  signatureMode: 'NONE',
  isCredential: true,
  hasExpiry: true,
  retentionMonths: 12,
  requiredForWorkflowIds: ['w1'],
  requiredFromAll: false,
  requiredFromRoleIds: ['r1'],
  visibleToRoleIds: ['r1'],
  twoSided: true,
  multiPage: true,
  scanShape: 'CARD',
};

/** The properties a payload was refused for. */
async function refused(dto: new () => object, payload: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, payload), PIPE);
  return errors.map((e) => e.property);
}

/**
 * What a document type carries, beyond its name.
 *
 * Kept as an explicit list rather than read off the Prisma schema: adding a
 * column should be a deliberate decision about whether the API exposes it, and
 * a test that derives the list would approve of whatever was done.
 */
const TYPE_FIELDS = [
  // The signing route was once silently DROPPED on create: the whitelist deleted it
  // before the service ran (auth-service create-type-route.spec covers the service).
  'signerRoute',
  'signatureMode',
  'isCredential',
  'hasExpiry',
  'retentionMonths',
  'requiredForWorkflowIds',
  'requiredFromAll',
  'requiredFromRoleIds',
  'visibleToRoleIds',
  'twoSided',
  'multiPage',
  'scanShape',
];

/**
 * Settable when the type is created and never afterwards — matching
 * `updateType`'s patch in auth-service, which does not accept them.
 *
 * Deliberate, not an omission: `direction` decides whether the organization
 * issues the document or the member supplies it, and flipping that under
 * documents already filed would leave every one of them on the wrong side of
 * the relationship.
 */
const CREATE_ONLY = ['key', 'cadence', 'direction'];

describe('the document-type DTOs', () => {
  it.each(TYPE_FIELDS)('declares %s on create, or the request is refused whole', async (field) => {
    expect(await refused(CreateDocumentTypeDto, { ...REQUIRED_ON_CREATE, [field]: SAMPLE[field] })).toEqual([]);
  });

  it.each(TYPE_FIELDS)('declares %s on update too', async (field) => {
    expect(await refused(UpdateDocumentTypeDto, { [field]: SAMPLE[field] })).toEqual([]);
  });

  it.each(CREATE_ONLY)('refuses %s on update — it is create-only', async (field) => {
    expect(await refused(UpdateDocumentTypeDto, { [field]: 'x' })).toContain(field);
  });

  it('lets an existing type be switched off and reordered (lifecycle, update only)', async () => {
    expect(await refused(UpdateDocumentTypeDto, { isActive: false, position: 3 })).toEqual([]);
  });
});
