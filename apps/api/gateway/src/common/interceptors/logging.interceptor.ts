import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, url, body, query } = request;
    const userAgent = request.get('user-agent') || '';
    const ip = request.ip || request.socket.remoteAddress;

    const now = Date.now();

    // Mask sensitive fields in body
    const maskedBody = this.maskSensitiveData({ ...body });

    // Log incoming request
    this.logger.log(
      `→ ${method} ${url} ${Object.keys(query).length ? JSON.stringify(query) : ''}`,
    );

    if (Object.keys(maskedBody).length > 0) {
      this.logger.debug(`  Body: ${JSON.stringify(maskedBody)}`);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - now;
          const statusCode = response.statusCode;

          // Color code based on status
          const statusColor = this.getStatusColor(statusCode);

          this.logger.log(
            `← ${method} ${url} ${statusColor}${statusCode}\x1b[0m ${responseTime}ms`,
          );
        },
        error: (error) => {
          const responseTime = Date.now() - now;
          const statusCode = error.status || 500;

          this.logger.error(
            `← ${method} ${url} \x1b[31m${statusCode}\x1b[0m ${responseTime}ms - ${error.message}`,
          );
        },
      }),
    );
  }

  private maskSensitiveData(data: Record<string, any>): Record<string, any> {
    const sensitiveFields = ['password', 'token', 'refreshToken', 'accessToken', 'secret', 'authorization'];
    const masked = { ...data };

    for (const key of Object.keys(masked)) {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
        masked[key] = '***';
      }
    }

    return masked;
  }

  private getStatusColor(statusCode: number): string {
    if (statusCode >= 500) return '\x1b[31m'; // Red for 5xx
    if (statusCode >= 400) return '\x1b[33m'; // Yellow for 4xx
    if (statusCode >= 300) return '\x1b[36m'; // Cyan for 3xx
    if (statusCode >= 200) return '\x1b[32m'; // Green for 2xx
    return '\x1b[0m'; // Default
  }
}
