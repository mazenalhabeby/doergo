import type { ValidationPipeOptions } from '@nestjs/common';

/**
 * The global ValidationPipe's options — one place, so the body specs validate exactly as the
 * server does. `forbidNonWhitelisted`: a body class refuses any key it does not declare.
 * `enableImplicitConversion`: a field is converted to its declared type (a numeric string
 * becomes a number; a boolean field would turn the STRING "false" into true).
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
};
