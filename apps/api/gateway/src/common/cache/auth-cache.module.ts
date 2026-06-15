import { Global, Module } from '@nestjs/common';
import { AuthTokenCache } from './auth-token-cache.service';

/** Global so the JwtAuthGuard and any controller can share one cache instance. */
@Global()
@Module({
  providers: [AuthTokenCache],
  exports: [AuthTokenCache],
})
export class AuthCacheModule {}
