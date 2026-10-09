import 'reflect-metadata';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { MarkNotificationsReadDto } from '../users.controller';

/** POST /users/me/notifications/read: a malformed body is a 400, never a 500. */
describe('MarkNotificationsReadDto', () => {
  // The gateway's own pipe settings (main.ts).
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: MarkNotificationsReadDto });

  it.each([{}, { ids: [] }, { ids: ['n1', 'n2'] }])('accepts %j', async (body) => {
    await expect(run(body)).resolves.toBeDefined();
  });

  it.each([{ ids: 'n1' }, { ids: [{}] }, { ids: [1] }, { ids: ['x'.repeat(65)] }, { ids: [], extra: 1 }, { ids: Array(501).fill('a') }])(
    'refuses %j with a 400',
    async (body) => {
      await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
