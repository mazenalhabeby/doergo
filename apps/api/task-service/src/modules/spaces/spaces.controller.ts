import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SpacesService } from './spaces.service';
import { SpaceReadService } from './space-read.service';
import { SpaceRosterService } from './space-roster.service';
import { MemberSpacesService } from './member-spaces.service';
import {
  pattern,
  type RpcRequest,
  findAllLocations,
  findOneLocation,
  getEffectiveModules,
  getLocationAssignments,
  getLocationAssignmentsBatch,
  getTechnicianAssignments,
  getColleagues,
} from '@hbcfield/shared/microservices';

@Controller()
export class SpacesController {
  constructor(
    private readonly locationsService: SpacesService,
    private readonly spaceRead: SpaceReadService,
    private readonly roster: SpaceRosterService,
    private readonly memberSpaces: MemberSpacesService,
  ) {}

  @MessagePattern(pattern(findAllLocations))
  async findAll(@Payload() data: RpcRequest<typeof findAllLocations>) {
    return this.spaceRead.findAll(data);
  }

  @MessagePattern(pattern(findOneLocation))
  async findOne(@Payload() data: RpcRequest<typeof findOneLocation>) {
    return this.spaceRead.findOne(data);
  }

  @MessagePattern(pattern(getEffectiveModules))
  async getEffectiveModules(@Payload() data: RpcRequest<typeof getEffectiveModules>) {
    return this.locationsService.getEffectiveModules(data);
  }

  @MessagePattern(pattern(getLocationAssignments))
  async getLocationAssignments(@Payload() data: RpcRequest<typeof getLocationAssignments>) {
    return this.roster.getLocationAssignments(data);
  }

  @MessagePattern(pattern(getLocationAssignmentsBatch))
  async getLocationAssignmentsBatch(@Payload() data: RpcRequest<typeof getLocationAssignmentsBatch>) {
    return this.roster.getLocationAssignmentsBatch(data);
  }

  @MessagePattern(pattern(getTechnicianAssignments))
  async getTechnicianAssignments(@Payload() data: RpcRequest<typeof getTechnicianAssignments>) {
    return this.memberSpaces.getTechnicianAssignments(data);
  }

  @MessagePattern(pattern(getColleagues))
  async getColleagues(@Payload() data: RpcRequest<typeof getColleagues>) {
    return this.memberSpaces.getColleagues(data);
  }
}
