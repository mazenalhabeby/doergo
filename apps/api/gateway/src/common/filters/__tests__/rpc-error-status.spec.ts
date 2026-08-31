import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from '../http-exception.filter';

/**
 * Refusals that arrive from a microservice.
 *
 * Reported three times in one evening, each looking like a different bug:
 * deleting a role in use, setting an invalid role value, and a validation
 * failure on a member edit. All the same thing — a service refused, said
 * exactly why, and the browser was told "Internal server error".
 *
 * The reason is not lost in transit. Measured against production, a thrown
 * BadRequestException comes back over Redis as:
 *
 *     { status: 400, statusCode: 400, message: 'Role name is required' }
 *
 * — a plain object, not an HttpException, which is the only shape this filter
 * used to recognise. So the status was sitting right there and being discarded.
 *
 * The security half matters as much as the fix: a 4xx was written for the caller
 * and carries its message; a 5xx is an internal failure, and forwarding its text
 * is how a stack trace or a database error reaches somebody's screen.
 */
describe('GlobalExceptionFilter — errors returned by a microservice', () => {
  let filter: GlobalExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'DELETE', url: '/api/v1/organizations/roles/abc' }),
      }),
    } as unknown as ArgumentsHost;
  });

  const sent = () => json.mock.calls[0][0];

  it('keeps the status and the reason a service gave', () => {
    filter.catch({ status: 409, statusCode: 409, message: 'This role is still assigned to 1 member.' }, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(sent().statusCode).toBe(409);
    expect(sent().message).toBe('This role is still assigned to 1 member.');
  });

  it('handles a payload carrying only `status`', () => {
    // Nest sends both; depending on what threw, only one may be present.
    filter.catch({ status: 400, message: 'Role name is required' }, host);
    expect(status).toHaveBeenCalledWith(400);
    expect(sent().message).toBe('Role name is required');
  });

  it('passes through a validation array unchanged', () => {
    filter.catch({ statusCode: 400, message: ['email must be an email', 'name should not be empty'] }, host);
    expect(sent().message).toEqual(['email must be an email', 'name should not be empty']);
  });

  it('never forwards the text of a server-side failure', () => {
    /*
      The sanitiser upstream already replaces most of these, but this filter is
      the last thing between an internal message and a browser, so it does not
      rely on that.
    */
    filter.catch({ statusCode: 500, message: 'relation "users" does not exist at line 4' }, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(sent().message).toBe('Internal server error');
    expect(JSON.stringify(sent())).not.toContain('relation');
  });

  it('ignores a status it did not send', () => {
    // Anything outside the HTTP error range is not a status, it is data that
    // happens to have a field called `status` — a job result, say.
    for (const bogus of [200, 302, 0, 999, -1]) {
      json.mockClear(); status.mockClear();
      filter.catch({ status: bogus, message: 'not an error status' }, host);
      expect(sent().statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(sent().message).not.toBe('not an error status');
    }
  });

  it('ignores an object with no status at all', () => {
    filter.catch({ message: 'just a message' }, host);
    expect(sent().statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(sent().message).toBe('Internal server error');
  });

  it('still handles a real HttpException the way it always did', () => {
    filter.catch(new HttpException('Forbidden resource', HttpStatus.FORBIDDEN), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(sent().message).toBe('Forbidden resource');
  });

  it('still hides the detail of an ordinary thrown Error', () => {
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);
    expect(sent().statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(sent())).not.toContain('ECONNREFUSED');
  });
});
