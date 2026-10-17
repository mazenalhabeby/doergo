import type { Prisma } from '@prisma/client';

/**
 * A value for a JSON column. Prisma's input type has an index signature that a
 * typed interface (a detail row, a snapshot) never declares, so a plain-valued
 * record has to be stated as JSON once — here, rather than as a cast at every
 * write. Only for values made of strings, numbers, booleans, null, arrays and
 * plain objects.
 */
export function jsonColumn(value: object): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** The same, leaving the column alone (`undefined`) when there is nothing to write. */
export function optionalJsonColumn(value: object | null | undefined): Prisma.InputJsonValue | undefined {
  return value ? jsonColumn(value) : undefined;
}
