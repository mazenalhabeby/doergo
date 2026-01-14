import { Controller, Get, Post, Body, Param, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { UpdateLocationDto } from './dto';

@ApiTags('tracking')
@ApiBearerAuth()
@Controller('tracking')
export class TrackingController {
  constructor(
    @Inject('TRACKING_SERVICE') private readonly trackingClient: ClientProxy,
  ) {}

  @Post('location')
  @ApiOperation({ summary: 'Update worker location (Mobile app)' })
  async updateLocation(@Body() updateLocationDto: UpdateLocationDto) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'update_location' }, updateLocationDto),
    );
  }

  @Get('workers')
  @ApiOperation({ summary: 'Get all active worker locations (Office only)' })
  async getActiveWorkers() {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_active_workers' }, {}),
    );
  }

  @Get('workers/:id')
  @ApiOperation({ summary: 'Get worker location by ID' })
  async getWorkerLocation(@Param('id') id: string) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_worker_location' }, { workerId: id }),
    );
  }

  @Get('workers/:id/history')
  @ApiOperation({ summary: 'Get worker location history' })
  async getWorkerHistory(@Param('id') id: string) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_worker_history' }, { workerId: id }),
    );
  }
}
