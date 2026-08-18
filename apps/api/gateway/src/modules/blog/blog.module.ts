import { Module } from '@nestjs/common';
import { BlogController } from './blog.controller';
import { BlogGatewayService } from './blog.service';

// The SERVICE_NAMES.AUTH ClientProxy is provided globally.
@Module({
  controllers: [BlogController],
  providers: [BlogGatewayService],
})
export class BlogModule {}
