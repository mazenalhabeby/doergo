import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions } from '@nestjs/microservices';
import { createMicroserviceOptions, RpcHttpExceptionFilter } from '@hbcfield/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    createMicroserviceOptions(),
  );

  // Preserve HTTP status codes (404/403/…) across the RPC boundary to the gateway.
  app.useGlobalFilters(new RpcHttpExceptionFilter());

  await app.listen();
  logger.log('Task Service is running...');
}

bootstrap();
