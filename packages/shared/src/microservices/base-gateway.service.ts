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
import { firstValueFrom, timeout, catchError } from 'rxjs';

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
   * Send a message to the microservice and wait for response
   */
  protected async send<T>(pattern: { cmd: string }, data: unknown): Promise<T> {
    try {
      const result = await firstValueFrom(
        this.client.send<T>(pattern, data).pipe(
          timeout(this.TIMEOUT_MS),
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
}
