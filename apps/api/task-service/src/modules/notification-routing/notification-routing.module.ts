import { Global, Module } from '@nestjs/common';
import { NotificationRoutingService } from './notification-routing.service';
import { NotificationRoutingController } from './notification-routing.controller';

/**
 * ONE routing service for the whole process.
 *
 * It was previously listed in the providers of three separate modules, which in
 * Nest means three instances — and since it caches resolved recipients in an
 * instance field, three caches of the same data: triple the memory, and a miss
 * in each because a lookup warmed by a task event did nothing for an attendance
 * one. Worse for what this module adds, invalidation delivered to one instance
 * would have left the other two serving what it had just dropped.
 *
 * Global so the three consumers keep injecting it without importing anything.
 */
@Global()
@Module({
  controllers: [NotificationRoutingController],
  providers: [NotificationRoutingService],
  exports: [NotificationRoutingService],
})
export class NotificationRoutingModule {}
