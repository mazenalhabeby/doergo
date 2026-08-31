import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from '../http-exception.filter';

/**
 * A refusal that a client can say in the reader's own language.
 *
 * Server messages are written where no locale is known — a German screen asked
 * to add a day off and was answered "This overlaps an existing time-off entry
 * for the employee". There are around 200 such strings across the services, so
 * translating them is incremental: a refusal carrying a `code` can be rendered
 * by the client, and every one without a code keeps its English text exactly as
 * before.
 *
 * These pin the part that has to be exactly right — that a code is passed
 * through for a 4xx, and that a 5xx still says nothing about itself.
 */
describe('GlobalExceptionFilter — refusal codes', () => {
  let filter: GlobalExceptionFilter;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    json = jest.fn();
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: jest.fn().mockReturnValue({ json }) }),
        getRequest: () => ({ method: 'POST', url: '/api/v1/employees/time-off/manual' }),
      }),
    } as unknown as ArgumentsHost;
  });

  const sent = () => json.mock.calls[0][0];

  it('passes a code and its params through from a service', () => {
    filter.catch(
      {
        statusCode: 400,
        message: 'This overlaps time off already recorded for this employee.',
        code: 'TIMEOFF_OVERLAP',
        params: { from: '2026-07-30', to: '2026-08-03', status: 'APPROVED' },
      },
      host,
    );

    expect(sent().code).toBe('TIMEOFF_OVERLAP');
    expect(sent().params).toEqual({ from: '2026-07-30', to: '2026-08-03', status: 'APPROVED' });
    // The English text stays, because a client that does not know the code shows it.
    expect(sent().message).toContain('overlaps');
  });

  it('passes a code from an HttpException raised in the gateway itself', () => {
    filter.catch(
      new HttpException({ message: 'Nope', code: 'SOMETHING_SPECIFIC' }, HttpStatus.CONFLICT),
      host,
    );
    expect(sent().statusCode).toBe(409);
    expect(sent().code).toBe('SOMETHING_SPECIFIC');
  });

  it('omits code and params entirely when there are none', () => {
    // An untouched error must look exactly as it did before this existed.
    filter.catch({ statusCode: 400, message: 'Plain refusal' }, host);
    expect('code' in sent()).toBe(false);
    expect('params' in sent()).toBe(false);
  });

  it('never carries a code out of a server-side failure', () => {
    /*
      A 5xx keeps its generic line, so this cannot become a second channel for
      internal detail alongside the message that is already suppressed.
    */
    filter.catch(
      { statusCode: 500, message: 'relation "users" does not exist', code: 'PRISMA_P2022', params: { table: 'users' } },
      host,
    );
    expect(sent().message).toBe('Internal server error');
    expect('code' in sent()).toBe(false);
    expect(JSON.stringify(sent())).not.toContain('users');
  });

  it('ignores a non-string code', () => {
    filter.catch({ statusCode: 400, message: 'x', code: { nested: true } }, host);
    expect('code' in sent()).toBe(false);
  });
});
