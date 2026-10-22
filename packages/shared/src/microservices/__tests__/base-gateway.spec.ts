import { HttpStatus } from '@nestjs/common';
import { BaseGatewayService } from '../base-gateway.service';

class Probe extends BaseGatewayService {
  constructor() {
    super({} as never, 'Probe');
  }
  map(e: unknown) {
    return this.toHttpException(e as never);
  }
}

describe('BaseGatewayService.toHttpException', () => {
  const probe = new Probe();
  beforeAll(() => jest.spyOn((probe as any).logger, 'error').mockImplementation(() => undefined));

  it('a 4xx keeps its message, code and params — written for the caller', () => {
    const e = probe.map({ statusCode: 409, message: 'Taken', code: 'ROLE_TASK_TAKEN', params: { n: 1 } });
    expect(e.getStatus()).toBe(409);
    expect(e.getResponse()).toEqual({ message: 'Taken', code: 'ROLE_TASK_TAKEN', params: { n: 1 } });
  });

  it('a 5xx never forwards its internal text', () => {
    const e = probe.map({ statusCode: 500, message: 'relation "users" does not exist' });
    expect(e.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(e.getResponse())).not.toContain('relation');
  });

  it('a call that never answered is a 408', () => {
    expect(probe.map({ name: 'TimeoutError' }).getStatus()).toBe(HttpStatus.REQUEST_TIMEOUT);
  });
});
