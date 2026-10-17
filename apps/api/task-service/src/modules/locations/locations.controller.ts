import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { LocationsService } from './locations.service';
import { SpaceReadService } from './space-read.service';
import { SpaceRosterService } from './space-roster.service';
import { MemberSpacesService } from './member-spaces.service';

@Controller()
export class LocationsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly spaceRead: SpaceReadService,
    private readonly roster: SpaceRosterService,
    private readonly memberSpaces: MemberSpacesService,
  ) {}

  @MessagePattern({ cmd: 'find_all_locations' })
  async findAll(@Payload() data: any) {
    return this.spaceRead.findAll(data);
  }

  @MessagePattern({ cmd: 'find_one_location' })
  async findOne(@Payload() data: any) {
    return this.spaceRead.findOne(data);
  }

  @MessagePattern({ cmd: 'get_effective_modules' })
  async getEffectiveModules(@Payload() data: any) {
    return this.locationsService.getEffectiveModules(data);
  }

  @MessagePattern({ cmd: 'get_location_assignments' })
  async getLocationAssignments(@Payload() data: any) {
    return this.roster.getLocationAssignments(data);
  }

  @MessagePattern({ cmd: 'get_location_assignments_batch' })
  async getLocationAssignmentsBatch(@Payload() data: any) {
    return this.roster.getLocationAssignmentsBatch(data);
  }

  @MessagePattern({ cmd: 'get_technician_assignments' })
  async getTechnicianAssignments(@Payload() data: any) {
    return this.memberSpaces.getTechnicianAssignments(data);
  }

  @MessagePattern({ cmd: 'get_colleagues' })
  async getColleagues(@Payload() data: any) {
    return this.memberSpaces.getColleagues(data);
  }
}
