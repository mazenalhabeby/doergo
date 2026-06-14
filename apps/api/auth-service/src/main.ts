import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { createMicroserviceOptions, RpcHttpExceptionFilter } from '@hbcfield/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    createMicroserviceOptions(),
  );

  // Preserve HTTP status codes (404/403/…) across the RPC boundary to the gateway.
  app.useGlobalFilters(new RpcHttpExceptionFilter());

  await app.listen();
  console.log('Auth Service is running...');
}

bootstrap();
