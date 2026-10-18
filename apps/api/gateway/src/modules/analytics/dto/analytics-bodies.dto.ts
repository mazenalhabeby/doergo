import { OptAny, OptBoolean, OptIn, OptNumber, OptString, OptStrings } from '../../../common/dto/body-fields';

/*
  Report builder bodies (CODE_AUDIT.md B3). The definition / config is passed AS SENT to
  `definitionFromBody` and the query engine, which refuse unknown datasets and fields — only
  the envelope is checked here. Client: the web's reports page (lib/api/analytics.ts).
*/

/** POST /analytics/run */
export class RunReportDto {
  @OptAny() definition!: unknown;
}

/** POST /analytics/reports */
export class CreateSavedReportDto {
  @OptString() name!: string;
  @OptString() description?: string;
  @OptAny() config!: unknown;
  @OptBoolean() isShared?: boolean;
}

/** PATCH /analytics/reports/:id */
export class UpdateSavedReportDto {
  @OptString() name?: string;
  @OptString() description?: string;
  @OptAny() config?: unknown;
  @OptBoolean() isShared?: boolean;
}

const CADENCES = ['daily', 'weekly', 'monthly'] as const;

/** POST /analytics/schedules */
export class CreateReportScheduleDto {
  @OptString() reportDefinitionId!: string;
  @OptIn(CADENCES) cadence!: (typeof CADENCES)[number];
  @OptNumber() hour?: number;
  @OptNumber() dayOfWeek?: number | null;
  @OptNumber() dayOfMonth?: number | null;
  @OptStrings() recipients!: string[];
  @OptBoolean() isActive?: boolean;
}

/** PATCH /analytics/schedules/:id */
export class UpdateReportScheduleDto {
  @OptIn(CADENCES) cadence?: (typeof CADENCES)[number];
  @OptNumber() hour?: number;
  @OptNumber() dayOfWeek?: number | null;
  @OptNumber() dayOfMonth?: number | null;
  @OptStrings() recipients?: string[];
  @OptBoolean() isActive?: boolean;
}
