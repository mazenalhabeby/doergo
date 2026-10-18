import { OptBoolean } from '../../../common/dto/body-fields';

/** POST /app/notify (operator) — anything but `dryRun: false` is a dry run, as before. */
export class AppUpdateNotifyDto {
  @OptBoolean() dryRun?: boolean;
}
