import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../validation-options';

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

/**
 * Run a body through the server's own ValidationPipe, as `@Body() body: Dto` does.
 * Answers the transformed body, or the refusal's messages.
 */
export async function validateBody<T>(
  dto: new () => T,
  payload: unknown,
): Promise<{ ok: true; body: T } | { ok: false; messages: string[] }> {
  const meta: ArgumentMetadata = { type: 'body', metatype: dto, data: undefined };
  try {
    return { ok: true, body: (await pipe.transform(payload, meta)) as T };
  } catch (e) {
    if (e instanceof BadRequestException) {
      const res = e.getResponse() as { message?: string | string[] };
      return { ok: false, messages: ([] as string[]).concat(res.message ?? []) };
    }
    throw e;
  }
}
