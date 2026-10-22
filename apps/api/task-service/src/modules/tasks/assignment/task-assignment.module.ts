import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TaskCoreModule } from '../core/task-core.module';
import { TechniciansModule } from '../../technicians/technicians.module';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskDeclineService } from './task-decline.service';
import { TaskCrewMembersService } from './task-crew-members.service';
import { RoleOpeningService } from './role-opening.service';
import { RolePoolService } from './role-pool.service';
import { RoleTakeService } from './role-take.service';
import { RoleStatsService } from './role-stats.service';
import { RolePoolSweepService } from './role-pool-sweep.service';
import { TechnicianSuggestionService } from './technician-suggestion.service';

/**
 * Who is on a job: assigning, declining, the crew's members, a job open to a WORK role (opening,
 * offering in waves, taking a place, the stats) and suggesting who could do it.
 */
@Module({
  imports: [
    TaskCoreModule,
    TechniciansModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  providers: [
    TaskAssignmentService,
    TaskDeclineService,
    TaskCrewMembersService,
    RoleOpeningService,
    RolePoolService,
    RoleTakeService,
    RoleStatsService,
    RolePoolSweepService,
    TechnicianSuggestionService,
  ],
  exports: [
    TaskAssignmentService,
    TaskDeclineService,
    TaskCrewMembersService,
    RoleOpeningService,
    RolePoolService,
    RoleTakeService,
    RoleStatsService,
    RolePoolSweepService,
    TechnicianSuggestionService,
  ],
})
export class TaskAssignmentModule {}
