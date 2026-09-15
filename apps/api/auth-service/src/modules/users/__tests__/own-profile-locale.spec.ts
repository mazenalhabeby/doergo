import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * A member choosing the language their notifications are written in.
 *
 * The value comes from the client, so what matters is what is REFUSED: only a
 * language the server has a push catalogue for is stored, a device's region
 * form is reduced to it, and anything else leaves the stored value alone rather
 * than resetting somebody to English.
 */
describe('updateOwnProfile — locale', () => {
  let service: UsersService;
  const prisma: Record<string, any> = {
    user: { update: jest.fn().mockResolvedValue({ id: 'u1' }) },
  };
  const dataOf = () => prisma.user.update.mock.calls[0][0].data;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: 'TASK_SERVICE', useValue: { emit: jest.fn() } },
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('stores a supported language', async () => {
    await service.updateOwnProfile('u1', { locale: 'it' });
    expect(dataOf()).toEqual({ locale: 'it' });
  });

  it('reduces a region form to the language', async () => {
    await service.updateOwnProfile('u1', { locale: 'de-AT' });
    expect(dataOf()).toEqual({ locale: 'de' });
  });

  it('ignores a language it has no catalogue for', async () => {
    await service.updateOwnProfile('u1', { locale: 'pt', firstName: 'Ana' });
    expect(dataOf()).toEqual({ firstName: 'Ana' });
  });

  it('returns the stored language so the app can confirm it', async () => {
    await service.updateOwnProfile('u1', { locale: 'fr' });
    expect(prisma.user.update.mock.calls[0][0].select).toEqual(expect.objectContaining({ locale: true }));
  });
});
