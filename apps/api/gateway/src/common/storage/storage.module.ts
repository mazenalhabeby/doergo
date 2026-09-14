import { Global, Module } from '@nestjs/common';
import { ObjectStoreModule } from '@hbcfield/shared/storage';
import { StorageService } from './storage.service';

/** Global: avatars and portal covers are uploaded from different modules. */
@Global()
@Module({
  imports: [ObjectStoreModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
