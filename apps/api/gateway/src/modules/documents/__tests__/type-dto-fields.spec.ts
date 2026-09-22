import * as fs from 'fs';
import * as path from 'path';

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

const DTO = fs.readFileSync(
  path.resolve(__dirname, '../dto/documents.dto.ts'),
  'utf8',
);

/** Comments quote field names constantly — this file included. */
const code = DTO.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function classBody(name: string): string {
  const start = code.indexOf(`export class ${name} {`);
  if (start < 0) throw new Error(`${name} not found — was it renamed?`);
  const end = code.indexOf('\nexport class ', start + 1);
  return code.slice(start, end < 0 ? undefined : end);
}

/** Declared property names of a DTO class. */
function fields(name: string): string[] {
  const body = classBody(name);
  return [...body.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)[?!]?:/gm)].map((m) => m[1]);
}

/**
 * What a document type carries, beyond its name.
 *
 * Kept as an explicit list rather than read off the Prisma schema: adding a
 * column should be a deliberate decision about whether the API exposes it, and
 * a test that derives the list would approve of whatever was done.
 */
const TYPE_FIELDS = [
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
  const create = fields('CreateDocumentTypeDto');
  const update = fields('UpdateDocumentTypeDto');

  it.each(TYPE_FIELDS)('declares %s on create, or the request is refused whole', (field) => {
    expect(create).toContain(field);
  });

  it.each(TYPE_FIELDS)('declares %s on update too', (field) => {
    expect(update).toContain(field);
  });

  it('keeps create and update in step, so a field cannot land on only one', () => {
    // Anything create-only is named above with its reason; `isActive` and
    // `position` are lifecycle, which only an existing type has.
    const drifted = create.filter((f) => !update.includes(f) && !CREATE_ONLY.includes(f));
    const onlyOnUpdate = update.filter(
      (f) => !create.includes(f) && f !== 'isActive' && f !== 'position',
    );
    expect({ drifted, onlyOnUpdate }).toEqual({ drifted: [], onlyOnUpdate: [] });
  });
});
