import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}


/**
 * An error that came back from a microservice.
 *
 * When a handler in auth-service or task-service throws, Nest serialises the
 * exception across Redis and the client observable rejects with a PLAIN OBJECT —
 * `{ status, statusCode, message }` — not an HttpException. The filter below used
 * to recognise only real HttpExceptions, so every one of those refusals arrived
 * at the browser as `500 Internal server error` with the reason discarded:
 * "this role is still assigned to 1 member" became "something went wrong".
 *
 * The status survives the hop; nothing was missing but the reading of it.
 */
function rpcError(exception: unknown): { statusCode: number; message: string | string[] } | null {
  if (!exception || typeof exception !== 'object' || exception instanceof Error) return null;
  const e = exception as Record<string, unknown>;

  const raw = typeof e.statusCode === 'number' ? e.statusCode
    : typeof e.status === 'number' ? e.status
    : null;
  // A status we did not send is not a status we trust.
  if (raw === null || raw < 400 || raw > 599) return null;

  /*
    Client errors carry their message; server errors do not.

    A 4xx is something the caller can act on and was written for them. A 5xx is
    an internal failure, and forwarding its text is how a stack trace or a
    database message ends up on somebody's screen — so it keeps the generic line
    exactly as an unrecognised exception would.
  */
  if (raw >= 500) return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };

  const message = typeof e.message === 'string' || Array.isArray(e.message) ? (e.message as string | string[]) : 'Request failed';
  return { statusCode: raw, message };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    const rpc = rpcError(exception);

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string | string[]) || message;
        error = (responseObj.error as string) || this.getErrorNameFromStatus(statusCode);
      }

      error = this.getErrorNameFromStatus(statusCode);
    } else if (rpc) {
      // A refusal a service already decided on, with the status it chose.
      statusCode = rpc.statusCode;
      message = rpc.message;
      error = this.getErrorNameFromStatus(statusCode);
    } else if (exception instanceof Error) {
      // Log unexpected errors with stack trace
      this.logger.error(
        `Unexpected error: ${exception.message}`,
        exception.stack,
      );
      // Don't expose internal error details to client
      message = 'An unexpected error occurred';
    }

    // Log all errors for monitoring
    this.logger.warn(
      `HTTP ${statusCode} ${request.method} ${request.url} - ${Array.isArray(message) ? message.join(', ') : message}`,
    );

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(errorResponse);
  }

  private getErrorNameFromStatus(status: number): string {
    const statusNames: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };

    return statusNames[status] || 'Error';
  }
}
