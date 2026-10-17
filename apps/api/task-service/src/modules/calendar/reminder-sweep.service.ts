import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, runWithCronLock } from '@hbcfield/shared';
import { EventsService } from './events.service';
import { EventAnswersService } from './event-answers.service';

/** Every minute, under the shared lease: send what is due (EventsService.sweepDue claims each row). */
@Injectable()
export class ReminderSweepService {
  private readonly logger = new Logger(ReminderSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventAnswers: EventAnswersService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepCron() {
    await runWithCronLock(
      this.prisma,
      { name: 'task:calendarReminders', ttlSeconds: 55, logger: this.logger },
      async () => {
        const sent = await this.eventAnswers.sweepDue();
        if (sent) this.logger.log(`Calendar reminders sent: ${sent}`);
      },
    );
  }
}
