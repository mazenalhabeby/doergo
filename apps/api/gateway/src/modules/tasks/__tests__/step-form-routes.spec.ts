/**
 * Step forms at the gateway: what a status change may carry, who may read a
 * job's submissions, and that a coded refusal reaches the phone intact.
 */
import 'reflect-metadata';
import { ArgumentsHost, ValidationPipe } from '@nestjs/common';
import { TasksController } from '../tasks.controller';
import { UpdateStatusDto } from '../dto';
import { CreateWorkflowStatusDto, UpdateWorkflowStatusDto } from '../../workflows/dto';
import { GlobalExceptionFilter } from '../../../common/filters/http-exception.filter';
import { SyncPushService } from '../../sync/sync-push.service';
import { SYNC_OPERATIONS } from '@hbcfield/shared';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

describe('PATCH /tasks/:id/status carries step-form answers', () => {
  it('accepts an answers object and keeps it whole for task-service to judge', async () => {
    const answers = { outcome: 'Won', pics: ['p1', 'p2'], passed: false, count: 3 };
    const dto = await pipe.transform({ status: 'VISITED', answers }, { type: 'body', metatype: UpdateStatusDto });
    expect(dto.answers).toEqual(answers);
  });

  it('refuses answers that are not an object', async () => {
    await expect(pipe.transform({ status: 'VISITED', answers: ['x'] }, { type: 'body', metatype: UpdateStatusDto })).rejects.toBeDefined();
    await expect(pipe.transform({ status: 'VISITED', answers: 'x' }, { type: 'body', metatype: UpdateStatusDto })).rejects.toBeDefined();
  });

  it('forwards the answers to the status job, with the caller identity after them', async () => {
    const queue = { updateTaskStatus: jest.fn().mockResolvedValue({ success: true }) };
    const controller = new TasksController(queue as any, {} as any);
    const req = { user: { id: 'u1', role: 'EMPLOYEE', organizationId: 'o1', canViewAllTasks: false } };
    await controller.updateStatus('t1', { status: 'VISITED', answers: { outcome: 'Won' } } as any, req);
    expect(queue.updateTaskStatus).toHaveBeenCalledWith(expect.objectContaining({
      id: 't1', status: 'VISITED', answers: { outcome: 'Won' }, userId: 'u1', organizationId: 'o1',
    }));
  });
});

describe('GET /tasks/:id/submissions', () => {
  it('asks task-service with exactly the facts GET /tasks/:id uses (the same access check)', async () => {
    const tasks = { findOne: jest.fn().mockResolvedValue({}), getSubmissions: jest.fn().mockResolvedValue({ data: [] }) };
    const controller = new TasksController({} as any, tasks as any);
    const req = {
      user: {
        id: 'u1', role: 'EMPLOYEE', organizationId: 'o1', canViewAllTasks: false, canAssignTasks: false,
        access: { sharedSpaces: [{ spaceId: 'shared1' }] },
      },
    };
    await controller.findOne('t1', req);
    await controller.getSubmissions('t1', req);
    const { canAssignTasks: _ignored, ...readFacts } = tasks.findOne.mock.calls[0][0];
    expect(tasks.getSubmissions.mock.calls[0][0]).toEqual(readFacts);
    expect(tasks.getSubmissions.mock.calls[0][0]).toMatchObject({ id: 't1', userId: 'u1', organizationId: 'o1', sharedSpaceIds: ['shared1'] });
  });

  it('declares no looser gate than reading the task itself', () => {
    const proto = TasksController.prototype as any;
    const keys = (fn: object) => Reflect.getMetadataKeys(fn).filter((k: unknown) => typeof k === 'string' && !String(k).startsWith('swagger') && k !== 'path' && k !== 'method');
    expect(keys(proto.getSubmissions)).toEqual(keys(proto.findOne));
  });
});

describe('workflow steps accept a form', () => {
  it('on create and on update, and null clears it', async () => {
    const form = { fields: [{ type: 'note', label: 'Notes', required: true }] };
    const created = await pipe.transform({ name: 'Visited', key: 'VISITED', form }, { type: 'body', metatype: CreateWorkflowStatusDto });
    expect(created.form).toEqual(form);
    const cleared = await pipe.transform({ form: null }, { type: 'body', metatype: UpdateWorkflowStatusDto });
    expect(cleared.form).toBeNull();
    await expect(pipe.transform({ form: 'x' }, { type: 'body', metatype: UpdateWorkflowStatusDto })).rejects.toBeDefined();
  });
});

describe('a step-form refusal reaches the client with its code and params', () => {
  const errors = [{ fieldId: 'outcome', code: 'required' }];

  it('through the exception filter (as BullMQ hands it over)', () => {
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: jest.fn().mockReturnValue({ json }) }),
        getRequest: () => ({ method: 'PATCH', url: '/api/v1/tasks/t1/status' }),
      }),
    } as unknown as ArgumentsHost;
    new GlobalExceptionFilter().catch(
      { statusCode: 400, message: 'Some answers this step asks for are missing or not valid.', code: 'STEP_FORM_INVALID', params: { statusKey: 'VISITED', errors } },
      host,
    );
    expect(json.mock.calls[0][0]).toMatchObject({ statusCode: 400, code: 'STEP_FORM_INVALID', params: { statusKey: 'VISITED', errors } });
  });

  it('through a sync push — the answers travel in the body, the refusal comes back coded', async () => {
    expect(SYNC_OPERATIONS['task.status']).toEqual({ method: 'PATCH', path: '/tasks/:taskId/status' });
    const service = new SyncPushService({ get: (k: string) => ({ PORT: '4000', API_PREFIX: 'api/v1' } as any)[k] } as any);
    const sent: any[] = [];
    (global as any).fetch = jest.fn(async (_url: string, init: any) => {
      sent.push(JSON.parse(init.body));
      return {
        ok: false, status: 400, headers: { get: () => null },
        json: async () => ({ code: 'STEP_FORM_FOREIGN_FILE', message: 'nope', params: { statusKey: 'VISITED', fileIds: ['x'] } }),
      } as any;
    });
    const res = await service.push(
      { headers: { authorization: 'Bearer t' }, ip: '203.0.113.9' } as any,
      [{
        id: '0190f3c2-7b1a-7c3d-9e4f-000000000001', op: 'task.status', lane: 'task:t1',
        payload: { params: { taskId: 't1' }, body: { status: 'VISITED', expectedFrom: 'WORKING', answers: { outcome: 'Won', pics: ['x'] } } },
      }],
    );
    expect(sent[0].answers).toEqual({ outcome: 'Won', pics: ['x'] });
    expect(res.results[0]).toMatchObject({ status: 'rejected', code: 'STEP_FORM_FOREIGN_FILE', params: { statusKey: 'VISITED', fileIds: ['x'] } });
  });
});
