import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import {
  CreateTechnicianDto,
  UpdateTechnicianDto,
  ListTechniciansDto,
  GetTechnicianDetailDto,
  GetTechnicianPerformanceDto,
} from './dto';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ============================================================================
  // EXISTING METHODS
  // ============================================================================

  @MessagePattern({ cmd: 'find_user' })
  async findOne(@Payload() data: { id: string }) {
    return this.usersService.findOne(data.id);
  }

  @MessagePattern({ cmd: 'get_profile' })
  async getProfile(@Payload() data: { userId: string }) {
    return this.usersService.findOne(data.userId);
  }

  @MessagePattern({ cmd: 'get_workers' })
  async getWorkers(@Payload() data: { organizationId?: string }) {
    return this.usersService.getWorkers(data.organizationId);
  }

  @MessagePattern({ cmd: 'get_worker_tasks' })
  async getWorkerTasks(@Payload() data: { workerId: string }) {
    return this.usersService.getWorkerTasks(data.workerId);
  }

  // ============================================================================
  // TECHNICIAN MANAGEMENT
  // ============================================================================

  @MessagePattern({ cmd: 'list_technicians' })
  async listTechnicians(@Payload() data: ListTechniciansDto) {
    return this.usersService.listTechnicians(data);
  }

  @MessagePattern({ cmd: 'get_technician_detail' })
  async getTechnicianDetail(@Payload() data: GetTechnicianDetailDto) {
    return this.usersService.getTechnicianDetail(data);
  }

  @MessagePattern({ cmd: 'create_technician' })
  async createTechnician(@Payload() data: CreateTechnicianDto) {
    return this.usersService.createTechnician(data);
  }

  @MessagePattern({ cmd: 'update_technician' })
  async updateTechnician(
    @Payload() data: { id: string; organizationId: string; dto: UpdateTechnicianDto },
  ) {
    return this.usersService.updateTechnician(data.id, data.organizationId, data.dto);
  }

  @MessagePattern({ cmd: 'deactivate_technician' })
  async deactivateTechnician(
    @Payload() data: { id: string; organizationId: string },
  ) {
    return this.usersService.deactivateTechnician(data.id, data.organizationId);
  }

  @MessagePattern({ cmd: 'get_technician_performance' })
  async getTechnicianPerformance(@Payload() data: GetTechnicianPerformanceDto) {
    return this.usersService.getTechnicianPerformance(data);
  }
}
