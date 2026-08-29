import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PreviewTemplateDto } from '../dto/documents.dto';

/**
 * The preview DTO, which shipped wrong once already.
 *
 * The service was written to accept a bodyless request — that is how the editor
 * asks for a member's resolved values, once, to render its live text preview —
 * but the DTO still demanded a body, so every one of those calls 400'd and the
 * screen fell back to showing raw {{tokens}}. Validation and the handler have to
 * agree about what is optional.
 */
const check = async (payload: Record<string, unknown>) =>
  validate(plainToInstance(PreviewTemplateDto, payload));

describe('PreviewTemplateDto', () => {
  it('accepts a request with no body — the values-only call', async () => {
    expect(await check({})).toEqual([]);
  });

  it('accepts a draft body', async () => {
    expect(await check({ body: '§1 Position\n\n{{member.fullName}}' })).toEqual([]);
  });

  it('accepts a title and a member', async () => {
    expect(await check({ body: 'x', title: 'Employment contract', memberId: 'u1' })).toEqual([]);
  });

  it('refuses a body that is not text', async () => {
    expect(await check({ body: { $ne: null } })).not.toEqual([]);
  });

  it('refuses a contract longer than the column can hold', async () => {
    expect(await check({ body: 'x'.repeat(200_001) })).not.toEqual([]);
  });
});
