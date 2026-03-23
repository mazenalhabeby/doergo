import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions } from '@nestjs/microservices';
import { createMicroserviceOptions } from '@doergo/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Create HTTP app for Socket.IO
  const app = await NestFactory.create(AppModule);

  // Enable CORS for Socket.IO
  app.enableCors({
    origin: [
      'http://localhost:3000',  // Web app
      'http://localhost:3001',
      'http://localhost:3002',
    ],
    credentials: true,
  });

  // Connect to Redis microservice for pub/sub events
  app.connectMicroservice<MicroserviceOptions>(createMicroserviceOptions());

  // Start all microservices (Redis)
  await app.startAllMicroservices();

  // Start HTTP server for Socket.IO
  const port = process.env.PORT || 4001;
  await app.listen(port);

  logger.log(`Notification Service is running on port ${port}`);
  logger.log('Socket.IO available at ws://localhost:' + port);
}

bootstrap();
