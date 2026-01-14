import { Controller, Get, Param, Query, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile() {
    // TODO: Get user ID from JWT token
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_profile' }, {}),
    );
  }

  @Get('workers')
  @ApiOperation({ summary: 'Get all workers (Office only)' })
  @ApiQuery({ name: 'organizationId', required: false })
  async getWorkers(@Query() query: Record<string, any>) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_workers' }, query),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'find_user' }, { id }),
    );
  }

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get tasks assigned to a worker' })
  async getWorkerTasks(@Param('id') id: string) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_worker_tasks' }, { workerId: id }),
    );
  }
}
