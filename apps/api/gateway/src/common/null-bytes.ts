import type { NextFunction, Request, Response } from 'express';

/**
 * A NUL character (`\u0000`) is refused at the door.
 *
 * Postgres cannot store one in a text column, so a search or a name carrying it reached the database and came back
 * as a 500 from deep inside (found by tools/layer0-gateway-e2e.py). Nothing a person types contains one — a request
 * that does is refused as 400 before any route runs.
 */
export function hasNulByte(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes('\u0000');
  if (depth > 32 || value === null || typeof value !== 'object' || Buffer.isBuffer(value)) return false;
  for (const v of Object.values(value)) if (hasNulByte(v, depth + 1)) return true;
  return false;
}

export function refuseNulBytes(req: Request, res: Response, next: NextFunction): void {
  const url = req.originalUrl ?? req.url ?? '';
  if (/%00/.test(url) || hasNulByte(req.body)) {
    res.status(400).json({
      statusCode: 400,
      message: 'The request contains a character that cannot be stored.',
      error: 'Bad Request',
      code: 'NUL_CHARACTER',
    });
    return;
  }
  next();
}
