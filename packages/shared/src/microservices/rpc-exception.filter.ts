import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import type { RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';
import { mapPrismaException, sanitizeErrorMessage } from '../api/prisma-error';

/**
 * Microservice exception filter that preserves the HTTP status across the RPC
 * boundary.
 *
 * NestJS does NOT serialize an HttpException's status code when an error crosses
 * the Redis transport, so a NotFoundException / ForbiddenException thrown inside
 * a service handler arrives at the gateway as a generic error and collapses into
 * a 500. This filter re-emits the error as a structured payload
 * `{ status, statusCode, message }` that `BaseGatewayService.send` maps back to
 * the correct HTTP status — so 404 stays 404, 403 stays 403, etc.
 *
 * Apply globally in each microservice bootstrap:
 *   app.useGlobalFilters(new RpcHttpExceptionFilter());
 */
@Catch()
export class RpcHttpExceptionFilter implements RpcExceptionFilter {
  catch(exception: unknown, _host: ArgumentsHost): Observable<never> {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : ((res as { message?: unknown })?.message ?? exception.message);
      return throwError(() => ({ status, statusCode: status, message }));
    }

    if (exception instanceof RpcException) {
      // Already an RPC error — pass its payload through unchanged.
      return throwError(() => exception.getError());
    }

    // Raw Prisma error → clean {status,message} so it never reaches a toast verbatim.
    const prisma = mapPrismaException(exception);
    if (prisma) {
      return throwError(() => ({ status: prisma.status, statusCode: prisma.status, message: prisma.message }));
    }

    // Unknown/unexpected error → keep an intentional plain-Error message but scrub
    // any raw Prisma/engine dump. Intentional messages should be HttpExceptions
    // (handled above); this is the safety net for the rest.
    const raw = exception instanceof Error ? exception.message : 'Internal server error';
    const clean = sanitizeErrorMessage(raw);
    return throwError(() => ({ status: clean.status, statusCode: clean.status, message: clean.message }));
  }
}
