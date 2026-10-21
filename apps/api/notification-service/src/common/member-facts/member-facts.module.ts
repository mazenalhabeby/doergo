import { Global, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { MemberFactsClient } from './member-facts.client';

/** The one auth-service client this service holds — global, so presence and i18n share it. */
@Global()
@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.AUTH)])],
  providers: [MemberFactsClient],
  exports: [MemberFactsClient],
})
export class MemberFactsModule {}
