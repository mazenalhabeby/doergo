import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/** Global: avatars and portal covers are uploaded from different modules. */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
