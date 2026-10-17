import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthSessionsController } from './auth-sessions.controller';
import { AuthBiometricController } from './auth-biometric.controller';

@Module({
  controllers: [AuthController, AuthSessionsController, AuthBiometricController],
})
export class AuthModule {}
