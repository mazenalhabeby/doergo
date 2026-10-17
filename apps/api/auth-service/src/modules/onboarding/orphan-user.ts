import { HttpStatus } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The user every onboarding path starts from: signed up, in no organization, not
 * yet onboarded. Paths A (create an org), B (join request) and C (invitation)
 * ask the same three questions in the same order, with the same answers.
 */
export async function orphanUser(prisma: PrismaService, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return { refusal: { success: false as const, statusCode: HttpStatus.NOT_FOUND, message: 'User not found' } };
  }

  if (user.onboardingCompleted) {
    return {
      refusal: { success: false as const, statusCode: HttpStatus.BAD_REQUEST, message: 'Onboarding already completed' },
    };
  }

  if (user.organizationId) {
    return {
      refusal: {
        success: false as const,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'User already belongs to an organization',
      },
    };
  }

  return { user };
}
