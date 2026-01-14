import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global Prisma Module
 *
 * Provides PrismaService globally to all modules in the application.
 * Import once in the root module.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
