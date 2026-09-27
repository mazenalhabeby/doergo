import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { nextStepForm, validateStepFormDefinition } from '@hbcfield/shared';

/**
 * A step's `form` as it is written on a workflow save.
 *
 *   undefined → leave the column alone (the editor did not send it)
 *   null      → clear it: back to "not set", the legacy rule applies again
 *   anything  → judged by `validateStepFormDefinition`, refused with a coded
 *               400 when wrong, and versioned against what the step held —
 *               the version moves only when the fields actually changed.
 *
 * A client-sent `version` is never trusted: it is the server's counter.
 */
export function stepFormForSave(
  input: unknown,
  previous: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (input === undefined) return undefined;
  if (input === null) return Prisma.DbNull;
  const res = validateStepFormDefinition(input);
  if (!res.ok) {
    throw new BadRequestException({
      message: 'This step form is not valid.',
      code: 'STEP_FORM_DEFINITION_INVALID',
      params: { errors: res.errors },
    });
  }
  return nextStepForm(previous, res.form.fields) as unknown as Prisma.InputJsonValue;
}
