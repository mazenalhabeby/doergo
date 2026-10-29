import { BadRequestException } from '@nestjs/common';
import { taskPortalParts } from './task-portal.service.fixture';

/*
  Triage never routes a client request into an ARCHIVED workspace: the request
  would become live work on a board nobody opens. Coded, like the clock-in's
  WORKSPACE_ARCHIVED, so each app says it in the reader's language.
*/
const ORG = 'org-1';

it('routing a request into an archived workspace is refused, nothing written', async () => {
  const prisma: any = {
    task: { findFirst: jest.fn().mockResolvedValue({ id: 't1', triaged: false }), update: jest.fn() },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'A', isActive: false }) },
  };
  const service = taskPortalParts(prisma, { emit: jest.fn() } as any, {} as any, {} as any, {} as any);
  const err = await service
    .triageRequest({ id: 't1', organizationId: ORG, userId: 'u', spaceId: 'A' })
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(BadRequestException);
  expect((err as BadRequestException).getResponse()).toMatchObject({ code: 'TRIAGE_WORKSPACE_ARCHIVED' });
  expect(prisma.task.update).not.toHaveBeenCalled();
});
