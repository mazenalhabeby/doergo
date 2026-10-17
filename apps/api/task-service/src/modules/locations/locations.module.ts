import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';

import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';

import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { SpaceReadService } from './space-read.service';
import { SpaceUpdateService } from './space-update.service';
import { SpaceLifecycleService } from './space-lifecycle.service';
import { SpaceRosterService } from './space-roster.service';
import { MemberSpacesService } from './member-spaces.service';
import { SpaceMembershipService } from './space-membership.service';
import { AssignmentTermsService } from './assignment-terms.service';

const SPACE_SERVICES = [
  LocationsService,
  SpaceReadService,
  SpaceUpdateService,
  SpaceLifecycleService,
  SpaceRosterService,
  MemberSpacesService,
  SpaceMembershipService,
  AssignmentTermsService,
];
import { LocationsProcessor } from './locations.processor';

@Module({
  // Space and roster mutations announce themselves so open clients re-read
  // instead of going stale until someone refreshes.
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [LocationsController],
  providers: [...SPACE_SERVICES, LocationsProcessor],
  exports: SPACE_SERVICES,
})
export class LocationsModule {}
