import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { createMicroserviceOptions } from '@doergo/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    createMicroserviceOptions(),
  );

  await app.listen();
  console.log('Task Service is running...');
}

bootstrap();
