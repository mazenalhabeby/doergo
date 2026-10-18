import { Module } from '@nestjs/common';
import { LabelCheckService } from './label-check.service';

/** The nightly label check — engineering only, never a customer surface. */
@Module({ providers: [LabelCheckService], exports: [LabelCheckService] })
export class LabelCheckModule {}
