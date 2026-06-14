import { Module } from '@nestjs/common';
import { EmployeesController } from './technicians.controller';

@Module({
  controllers: [EmployeesController],
})
export class EmployeesModule {}
