import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    // SECURITY: Use async registration to ensure JWT_ACCESS_SECRET is configured
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_ACCESS_SECRET');
        if (!secret) {
          throw new Error(
            'CRITICAL: JWT_ACCESS_SECRET environment variable is not set. ' +
            'Generate a strong secret (minimum 32 characters) and set it in your .env file.',
          );
        }
        // SECURITY: Ensure minimum secret length for security
        if (secret.length < 32) {
          throw new Error(
            'CRITICAL: JWT_ACCESS_SECRET must be at least 32 characters long. ' +
            'Use a cryptographically secure random string.',
          );
        }
        return {
          secret,
          signOptions: { expiresIn: configService.get('JWT_ACCESS_EXPIRATION', '15m') },
        };
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
