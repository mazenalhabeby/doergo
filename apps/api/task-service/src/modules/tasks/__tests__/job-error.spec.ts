import { UnrecoverableError } from 'bullmq';
import { buildJobError } from '@hbcfield/shared';

/**
 * H3 — a business/client failure (4xx) must NOT be retried by BullMQ; a 5xx /
 * unexpected error stays retryable. buildJobError encodes that decision.
 */
describe('buildJobError (H3)', () => {
  it('returns UnrecoverableError for a 4xx (no retry)', () => {
    const err = buildJobError({ message: 'Invalid role', status: 400 });
    expect(err).toBeInstanceOf(UnrecoverableError);
    expect(JSON.parse(err.message)).toEqual({ message: 'Invalid role', statusCode: 400 });
  });

  it('reads statusCode as well as status', () => {
    const err = buildJobError({ message: 'Forbidden', statusCode: 403 });
    expect(err).toBeInstanceOf(UnrecoverableError);
  });

  it('returns a plain (retryable) Error for a 5xx', () => {
    const err = buildJobError({ message: 'DB down', status: 500 });
    expect(err).not.toBeInstanceOf(UnrecoverableError);
    expect(err).toBeInstanceOf(Error);
    expect(JSON.parse(err.message)).toEqual({ message: 'DB down', statusCode: 500 });
  });

  it('defaults an unclassified error to retryable 500', () => {
    const err = buildJobError(new Error('boom'));
    expect(err).not.toBeInstanceOf(UnrecoverableError);
    expect(JSON.parse(err.message).statusCode).toBe(500);
  });
});
