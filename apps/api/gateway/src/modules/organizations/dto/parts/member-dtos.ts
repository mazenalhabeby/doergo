/** Moved here unchanged from dto/index.ts. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Update member profile, role, and permissions DTO
 */
export class UpdateMemberDto {
  /*
    What this person bills and costs, per hour, in integer cents.

    ⚠️ Null is not zero. Null means "inherit from the level above" — which for
    most people is the right answer for the BILL, because the contract rate
    lives on the client. Zero is a real rate of nothing. `cleanRateCents` keeps
    both whole and bounded on the way in.
  */
  @ApiPropertyOptional({ description: 'What this person BILLS per hour, in EUR cents. Null inherits; 0 is a real rate.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  billRateCents?: number | null;

  @ApiPropertyOptional({ description: 'What this person COSTS per hour, in EUR cents. Setting one turns the product two-rate.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  costRateCents?: number | null;

  @ApiPropertyOptional({ description: "Annual vacation days for this member. Null = use the organization's default; 0 = no paid leave." })
  @IsOptional()
  leaveAllowance?: number | null;

  @ApiPropertyOptional({ description: 'The date this person started working here (YYYY-MM-DD). Pro-rates their first year.' })
  @IsOptional()
  @IsString()
  employmentStartDate?: string | null;

  @ApiPropertyOptional({ description: 'Login email (must be unique across all users)' })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Position/title (e.g., Technician, Driver, Office Manager)' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({
    description:
      'The company (legal entity) that employs them — the employer on their ' +
      "contracts. Null or empty = the organization's main company.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  employerEntityId?: string | null;

  /*
    A DATE, validated as one. `@IsDateString` would accept a full timestamp and
    let a browser's local midnight through as the previous day; the column is
    `@db.Date` and the only thing that belongs in it is a calendar day.
  */
  @ApiPropertyOptional({ description: 'Date of birth, YYYY-MM-DD. Null clears it.', example: '1990-03-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ enum: ['NONE', 'FIXED', 'FLEXIBLE'], description: 'Schedule type for time tracking' })
  @IsOptional()
  @IsEnum(['NONE', 'FIXED', 'FLEXIBLE'], { message: 'scheduleType must be NONE, FIXED, or FLEXIBLE' })
  scheduleType?: string;

  @ApiPropertyOptional({ description: 'Monthly hour budget (for FLEXIBLE schedule type)' })
  @IsOptional()
  @IsNumber()
  monthlyHourBudget?: number;

  @ApiPropertyOptional({ enum: ['ADMIN', 'EMPLOYEE'], description: 'New role' })
  @IsOptional()
  @IsEnum(['ADMIN', 'EMPLOYEE'])
  role?: string;

  @ApiPropertyOptional({ description: 'Org-wide role id (AccessRole), or null to clear' })
  @IsOptional()
  @IsString()
  memberRoleId?: string | null;

  @ApiPropertyOptional({
    description:
      'Works for a client or partner, not for this organization. Excluded from payroll, headcount and rotas; cannot hold an org-wide role.',
  })
  @IsOptional()
  @IsBoolean()
  isExternal?: boolean;

  @ApiPropertyOptional({ description: 'Can create tasks' })
  @IsOptional()
  @IsBoolean()
  canCreateTasks?: boolean;

  @ApiPropertyOptional({ enum: ['NONE', 'SELF', 'SPACE', 'ORG'], description: 'Task creation scope' })
  @IsOptional()
  @IsEnum(['NONE', 'SELF', 'SPACE', 'ORG'], { message: 'taskCreationScope must be NONE, SELF, SPACE, or ORG' })
  taskCreationScope?: string;

  @ApiPropertyOptional({ description: 'Can view all tasks' })
  @IsOptional()
  @IsBoolean()
  canViewAllTasks?: boolean;

  @ApiPropertyOptional({ description: 'Can assign tasks' })
  @IsOptional()
  @IsBoolean()
  canAssignTasks?: boolean;

  @ApiPropertyOptional({ description: 'Can manage users' })
  @IsOptional()
  @IsBoolean()
  canManageUsers?: boolean;

  @ApiPropertyOptional({ description: 'May build/run reports (report access)' })
  @IsOptional()
  @IsBoolean()
  canViewReports?: boolean;

  @ApiPropertyOptional({ description: 'Per-user Access Profile (modules, spaceScope, platforms, canContact) or a module string[]' })
  @IsOptional()
  enabledModules?: unknown;

  @ApiPropertyOptional({ description: 'Reachable in chat / messaging (inbound)' })
  @IsOptional()
  @IsBoolean()
  contactable?: boolean;

  @ApiPropertyOptional({ enum: ['NONE', 'ALL', 'SELECTED'], description: 'Who this member may contact' })
  @IsOptional()
  @IsEnum(['NONE', 'ALL', 'SELECTED'])
  contactScope?: string;

  @ApiPropertyOptional({ description: 'Allowed contact user IDs (when contactScope=SELECTED)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactAllowedIds?: string[];

  @ApiPropertyOptional({ description: 'May clock in remotely (WFH/anywhere)' })
  @IsOptional()
  @IsBoolean()
  allowRemote?: boolean;
}

/** Who the organization is being handed to. */
export class TransferOwnershipDto {
  @IsString()
  @IsNotEmpty()
  newOwnerId!: string;
}

/** A member's phone home screen, set up from the office. The service validates the values. */
export class SetMemberHomeDto {
  @ApiProperty({ type: [String], description: 'Widgets to show, in order' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  widgets!: string[];

  @ApiPropertyOptional({ type: [String], description: 'Shortcut tiles, in order (at most 4)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  shortcuts?: string[];
}
