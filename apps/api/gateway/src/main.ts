import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Simple request logging for testing
  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    const { method, url, body } = req;

    // Log request
    console.log(`\n→ ${method} ${url}`);
    if (body && Object.keys(body).length > 0) {
      const safeBody = { ...body };
      if (safeBody.password) safeBody.password = '***';
      console.log(`  Body:`, safeBody);
    }

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const color = status >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(`← ${method} ${url} ${color}${status}\x1b[0m ${duration}ms`);
    });

    next();
  });
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false, // Disable CSP in dev for Swagger
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Global prefix
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  // CORS
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3001,http://localhost:3002');
  app.enableCors({
    origin: corsOrigins.split(','),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter for consistent error responses
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger documentation - ONLY in development
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Doergo API Gateway')
      .setDescription('API Gateway for Doergo microservices platform')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('tasks', 'Task management endpoints')
      .addTag('users', 'User management endpoints')
      .addTag('tracking', 'Location tracking endpoints')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  // Start server
  const port = configService.get<number>('PORT', 4000);
  await app.listen(port);

  console.log(`API Gateway is running on: http://localhost:${port}`);
  if (!isProduction) {
    console.log(`Swagger docs available at: http://localhost:${port}/docs`);
  }
}

bootstrap();
