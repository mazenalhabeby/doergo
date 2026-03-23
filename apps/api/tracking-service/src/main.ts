import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions } from '@nestjs/microservices';
import { createMicroserviceOptions } from '@doergo/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    createMicroserviceOptions(),
  );

  await app.listen();
  logger.log('Tracking Service is running...');
}

bootstrap();
