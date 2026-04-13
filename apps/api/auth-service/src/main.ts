import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { createMicroserviceOptions } from '@hbcfield/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    createMicroserviceOptions(),
  );

  await app.listen();
  console.log('Auth Service is running...');
}

bootstrap();
