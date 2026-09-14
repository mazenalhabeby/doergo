import { ValidationPipe } from '@nestjs/common';
import { CreateTaskDto, UpdateTaskDto } from '../dto';

/** A task may be NAMED by the phone that creates it, and never renamed by an update. */
describe('task ids in request bodies', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

  it('accepts a phone-made id on create', async () => {
    const dto = await pipe.transform({ id: '0190f3c2-7b1a-7c3d-9e4f-000000000001', title: 'Leak' }, { type: 'body', metatype: CreateTaskDto });
    expect(dto.id).toBe('0190f3c2-7b1a-7c3d-9e4f-000000000001');
  });

  it('refuses an id on update', async () => {
    await expect(pipe.transform({ id: 'another-task-id-0000001', title: 'Leak' }, { type: 'body', metatype: UpdateTaskDto })).rejects.toBeDefined();
  });
});
