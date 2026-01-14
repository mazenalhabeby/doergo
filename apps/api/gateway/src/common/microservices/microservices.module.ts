import { Global, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import {
  SERVICE_NAMES,
  createMultipleClientOptions,
} from '@doergo/shared';

/**
 * Microservices Module
 *
 * Provides Redis-based client connections to all microservices.
 * Uses shared configuration factory for consistency.
 */
@Global()
@Module({
  imports: [
    ClientsModule.registerAsync(
      createMultipleClientOptions([
        SERVICE_NAMES.AUTH,
        SERVICE_NAMES.TASK,
        SERVICE_NAMES.NOTIFICATION,
        SERVICE_NAMES.TRACKING,
      ])
    ),
  ],
  exports: [ClientsModule],
})
export class MicroservicesModule {}
