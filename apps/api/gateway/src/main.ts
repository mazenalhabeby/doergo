import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Serve uploaded files (avatars, etc.) as static assets
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Trust the proxy/load-balancer so req.ip and the throttler use the real
  // client IP (X-Forwarded-For) instead of bucketing every client together.
  app.set('trust proxy', 1);

  // Increase body size limit for base64 signatures
  const express = require('express');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Parse cookies (for httpOnly refresh token)
  app.use(cookieParser());

  // Simple request logging for testing (skip noisy endpoints)
  const QUIET_ROUTES = ['/tracking/location'];
  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    const { method, url, body } = req;
    const isQuiet = QUIET_ROUTES.some((r) => url.includes(r));

    // Log request (skip noisy polling endpoints)
    if (!isQuiet) {
      console.log(`\n→ ${method} ${url}`);
      if (body && Object.keys(body).length > 0) {
        const safeBody = { ...body };
        if (safeBody.password) safeBody.password = '***';
        console.log(`  Body:`, safeBody);
      }
    }

    // Log response
    res.on('finish', () => {
      if (isQuiet) return;
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

  // Global prefix (exclude admin routes for Bull Board)
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['admin/queues', 'admin/queues/(.*)'],
  });

  // Protect Bull Board in production — require basic auth
  if (isProduction) {
    const bullBoardUser = configService.get<string>('BULL_BOARD_USER', 'admin');
    const bullBoardPass = configService.get<string>('BULL_BOARD_PASSWORD');
    if (bullBoardPass) {
      app.use('/admin/queues', (req: any, res: any, next: any) => {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
          return res.status(401).send('Authentication required');
        }
        const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
        if (user === bullBoardUser && pass === bullBoardPass) return next();
        res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
        return res.status(401).send('Invalid credentials');
      });
    } else {
      // No password configured — block access entirely in production
      app.use('/admin/queues', (_req: any, res: any) => {
        res.status(403).send('Bull Board disabled in production. Set BULL_BOARD_PASSWORD to enable.');
      });
    }
  }

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
      .setTitle('HBCField API Gateway')
      .setDescription('API Gateway for HBCField microservices platform')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('tasks', 'Task management endpoints')
      .addTag('users', 'User management endpoints')
      .addTag('tracking', 'Location tracking endpoints')
      .addTag('invitations', 'Invitation management endpoints')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  // Start server
  // Listen on 0.0.0.0 to accept connections from mobile devices on the same network
  const port = configService.get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');

  console.log(`API Gateway is running on: http://0.0.0.0:${port}`);
  if (!isProduction) {
    console.log(`Swagger docs available at: http://localhost:${port}/docs`);
  }
}

bootstrap();
