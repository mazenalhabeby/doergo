import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions } from '@nestjs/microservices';
import { createMicroserviceOptions, RpcHttpExceptionFilter } from '@hbcfield/shared';
import { AppModule } from './app.module';
import { scopeWhere } from '@hbcfield/shared';

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
  /*
    Does THIS process narrow reads to the caller's granted spaces?

    The other half of the gateway's marker: the guard widens, this narrows, and
    a mismatch between the two processes is the one state that leaks. Printed
    from the same import the queries use.
  */
  logger.log(`[access] space narrowing: ${typeof scopeWhere === 'function' ? 'ON' : 'MISSING'}`);
}

bootstrap();
