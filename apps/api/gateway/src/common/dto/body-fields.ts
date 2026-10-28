import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Allow, IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Field decorators for request bodies that used to be plain interfaces (CODE_AUDIT.md B3).
 *
 * The global ValidationPipe runs with `whitelist` + `forbidNonWhitelisted`, so a body class
 * REFUSES any key it does not declare: every field a real client sends must be declared,
 * including ones the route ignores. Everything here is OPTIONAL and checks only the TYPE —
 * a missing field still reaches the service, which refuses it with its own coded message
 * (the clients translate the code; a generic 400 would lose it). Bounds stay with the
 * services for the same reason.
 *
 * Numbers are converted to their type (a numeric string becomes the number it was — what the
 * routes' own Number() did); a value a PARSER reads as typed is declared `number | string` with
 * OptAny so nothing converts it. Booleans see the value as sent (OptBoolean). Nested objects
 * are checked as objects only — their keys are the service's to validate.
 */

/**
 * Keep the value exactly as the client sent it. ⚠️ `enableImplicitConversion` rebuilds values
 * by their declared type before validation: an array's items become empty arrays (`[{…}]` →
 * `[[]]`), any value becomes a boolean, an object loses nothing only by luck. Everything that
 * is not a plain string or number goes through this, so the service receives what was sent.
 */
const AsSent = () => Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key]);

/** A string, or absent / null. */
export const OptString = () => applyDecorators(IsOptional(), IsString());
/** A field the service cannot work without — missing is a 400, never a crash in the service (layer 1 test). */
export const ReqString = () => applyDecorators(IsString(), IsNotEmpty());

/** A finite number, or absent / null. */
export const OptNumber = () => applyDecorators(IsOptional(), IsNumber({ allowNaN: false, allowInfinity: false }));

/**
 * A REAL boolean, or absent / null. ⚠️ `enableImplicitConversion` turns ANY value into a boolean
 * before validation (the string "false" → true, an object → true); the transform puts back the
 * value as it was sent, so IsBoolean sees what the client really sent.
 */
export const OptBoolean = () => applyDecorators(AsSent(), IsOptional(), IsBoolean());

/** An array of strings, or absent / null. */
export const OptStrings = () => applyDecorators(AsSent(), IsOptional(), IsArray(), IsString({ each: true }));

/** An array (of anything — its items are the service's), or absent / null. */
export const OptArray = () => applyDecorators(AsSent(), IsOptional(), IsArray());

/** An object (its keys are the service's), or absent / null. */
export const OptObject = () => applyDecorators(AsSent(), IsOptional(), IsObject());
export const ReqObject = () => applyDecorators(AsSent(), IsObject());

/** One of the listed values, or absent / null. */
export const OptIn = (values: readonly unknown[]) => applyDecorators(AsSent(), IsOptional(), IsIn([...values]));

/** Declared so the whitelist lets it through; any value — the service reads and checks it. */
export const OptAny = () => applyDecorators(AsSent(), IsOptional(), Allow());
