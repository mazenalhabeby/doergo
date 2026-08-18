import { Module } from '@nestjs/common';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

// PrismaService comes from the global PrismaModule.
@Module({
  controllers: [BlogController],
  providers: [BlogService],
})
export class BlogModule {}
