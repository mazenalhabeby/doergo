import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, IsIn, Min, Max, MaxLength } from 'class-validator';

export class RespondToOvertimeDto {
  @ApiProperty({ enum: ['YES', 'NO'], description: 'Technician response to overtime prompt' })
  @IsIn(['YES', 'NO'])
  response: 'YES' | 'NO';

  @ApiPropertyOptional({ description: 'Reason for needing overtime' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

export class ApproveOvertimeDto {
  @ApiProperty({ description: 'Maximum overtime duration in minutes', example: 120 })
  @IsNumber()
  @Min(15)
  @Max(480)
  maxDurationMinutes: number;

  @ApiPropertyOptional({ description: 'Approver notes' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}

export class ApproveOvertimeSignatureDto {
  @ApiProperty({ description: 'Maximum overtime duration in minutes', example: 120 })
  @IsNumber()
  @Min(15)
  @Max(480)
  maxDurationMinutes: number;

  @ApiProperty({ description: 'ID of the approving leader (admin/dispatcher)' })
  @IsString()
  @IsNotEmpty()
  approverId: string;

  @ApiProperty({ description: 'Name of the approving leader' })
  @IsString()
  @IsNotEmpty()
  leaderName: string;

  @ApiProperty({ description: 'Leader signature as base64 PNG' })
  @IsString()
  @IsNotEmpty()
  leaderSignature: string;

  @ApiPropertyOptional({ description: 'Approver notes' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}

export class RejectOvertimeDto {
  @ApiProperty({ description: 'Reason for rejection' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
