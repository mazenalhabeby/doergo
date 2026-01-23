import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateReportDto {
  @ApiPropertyOptional({
    description: 'Updated summary of work done',
    example: 'Replaced compressor and recharged refrigerant system',
  })
  @IsString()
  @IsOptional()
  summary?: string;

  @ApiPropertyOptional({
    description: 'Updated detailed description of work performed',
    example: '1. Diagnosed faulty compressor\n2. Removed old unit\n3. Installed replacement',
  })
  @IsString()
  @IsOptional()
  workPerformed?: string;

  @ApiPropertyOptional({
    description: 'Updated technician signature as base64 encoded PNG',
    example: 'data:image/png;base64,...',
  })
  @IsString()
  @IsOptional()
  technicianSignature?: string;

  @ApiPropertyOptional({
    description: 'Updated customer signature as base64 encoded PNG',
    example: 'data:image/png;base64,...',
  })
  @IsString()
  @IsOptional()
  customerSignature?: string;

  @ApiPropertyOptional({
    description: 'Updated name of customer who signed',
    example: 'John Smith',
  })
  @IsString()
  @IsOptional()
  customerName?: string;
}
