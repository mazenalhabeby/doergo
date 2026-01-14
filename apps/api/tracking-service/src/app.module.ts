import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@doergo/shared';
import { PrismaModule } from './common/prisma/prisma.module';
import { LocationModule } from './modules/location/location.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.registerAsync([
      createClientOptions(SERVICE_NAMES.NOTIFICATION),
    ]),
    PrismaModule,
    LocationModule,
  ],
})
export class AppModule {}
