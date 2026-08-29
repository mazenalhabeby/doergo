/**
 * Base Gateway Service
 *
 * Provides common microservice communication pattern for READ operations.
 * Extend this class in your gateway services to avoid code duplication.
 *
 * @example
 * @Injectable()
 * export class TasksService extends BaseGatewayService {
 *   constructor(@Inject(SERVICE_NAMES.TASK) client: ClientProxy) {
 *     super(client, 'TasksService');
 *   }
 *
 *   async findAll(data: Record<string, any>) {
 *     return this.send({ cmd: 'find_all_tasks' }, data);
 *   }
 * }
 */
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, retry, timer } from 'rxjs';

interface ServiceError {
  name?: string;
  status?: number;
  statusCode?: number;
  response?: { statusCode?: number; message?: string | string[] };
  message?: string;
}

export abstract class BaseGatewayService {
  protected readonly logger: Logger;
  protected readonly TIMEOUT_MS = 10000; // 10 second timeout for read operations

  constructor(
    protected readonly client: ClientProxy,
    serviceName: string,
  ) {
    this.logger = new Logger(serviceName);
  }

  /**
   * Send a message to the microservice and wait for a response.
   *
   * RETRIES transient transport failures, so it is for READS. For anything that
   * writes, use `sendOnce` — see the note there.
   */
  protected async send<T>(pattern: { cmd: string }, data: unknown): Promise<T> {
    try {
      const result = await firstValueFrom(
        this.client.send<T>(pattern, data).pipe(
          timeout(this.TIMEOUT_MS),
          // Retry only TRANSIENT transport failures (timeout / connection) — never
          // business errors (a 4xx carries a status, so we re-throw immediately).
          // Safe because these are READ operations. Backoff 150ms, 300ms.
          retry({
            count: 2,
            delay: (err, retryCount) => {
              const e = err as ServiceError;
              const hasStatus = e?.status ?? e?.statusCode ?? e?.response?.statusCode;
              if (hasStatus) throw err;
              this.logger.warn(`RPC retry ${retryCount} for ${pattern.cmd}: ${e?.message ?? err}`);
              return timer(150 * retryCount);
            },
          }),
          catchError((err: Error) => {
            this.logger.error(`Service error: ${err.message}`);
            throw err;
          }),
        ),
      );
      return result;
    } catch (err) {
      const error = err as ServiceError;
      if (error.name === 'TimeoutError') {
        throw new HttpException('Service timeout', HttpStatus.REQUEST_TIMEOUT);
      }
      // Re-throw HTTP exceptions from the microservice with their real status.
      // A NestJS HttpException serialized over RPC exposes the code as
      // `statusCode` (or nested under `response`), not `status` — so check all
      // forms; otherwise a 404/403 would collapse into a generic 500.
      const status = error.status ?? error.statusCode ?? error.response?.statusCode;
      const message = error.response?.message ?? error.message;
      if (status && message) {
        throw new HttpException(message, status);
      }
      throw new HttpException(
        error.message || 'Service error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Send a message ONCE. Same status mapping as `send`, no retry.
   *
   * A retry is only safe when replaying the call is harmless. It is not for a
   * write: a timeout means "no answer arrived", never "nothing happened", so
   * retrying an issue-document or create-invoice call can produce two of them —
   * and the second one is invisible until somebody notices a duplicate.
   *
   * The timeout is longer than a read's because a write may legitimately do
   * more work (hash a file, write in a transaction) before it answers.
   */
  protected async sendOnce<T>(
    pattern: { cmd: string },
    data: unknown,
    timeoutMs = 30000,
  ): Promise<T> {
    try {
      return await firstValueFrom(
        this.client.send<T>(pattern, data).pipe(
          timeout(timeoutMs),
          catchError((err: Error) => {
            this.logger.error(`Service error: ${err.message}`);
            throw err;
          }),
        ),
      );
    } catch (err) {
      throw this.toHttpException(err as ServiceError);
    }
  }

  /**
   * A service error, as the HTTP status it actually was.
   *
   * A NestJS HttpException serialized over RPC exposes its code as `statusCode`
   * (or nested under `response`), never as `status` alone — so all three forms
   * are checked. Miss one and every 404 and 403 arrives at the client as a 500,
   * which is how a "not found" becomes an incident.
   */
  protected toHttpException(error: ServiceError): HttpException {
    if (error?.name === 'TimeoutError') {
      return new HttpException('Service timeout', HttpStatus.REQUEST_TIMEOUT);
    }
    const status = error?.status ?? error?.statusCode ?? error?.response?.statusCode;
    const message = error?.response?.message ?? error?.message;
    if (status && message) return new HttpException(message, status);
    return new HttpException(error?.message || 'Service error', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
