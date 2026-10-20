import { Inject, Injectable, NotFoundException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';
import {
  sendRpc,
  accessRolesEnsureBuiltIns,
  spaceRoleCreate,
  spaceRoleUpdate,
  type SpaceRoleWrite,
} from '@hbcfield/shared/microservices';

/**
 * auth-service owns AccessRole (docs/data-ownership.md, group D): the workspace-role screens decide a
 * role here and ask auth to write it. Merging and deleting a role stay here — one transaction with the
 * assignments, the agreed exception.
 */
@Injectable()
export class RoleWriter {
  private readonly logger = new Logger(RoleWriter.name);
  constructor(@Inject(SERVICE_NAMES.AUTH) private readonly auth: ClientProxy) {}

  private async ask<R>(name: string, call: () => import('rxjs').Observable<R>): Promise<R> {
    try {
      return await firstValueFrom(call().pipe(timeout(15_000)));
    } catch (e) {
      this.logger.error(`${name} failed: ${(e as Error)?.message ?? e}`);
      throw new ServiceUnavailableException('Roles cannot be changed right now. Try again.');
    }
  }

  async ensureBuiltIns(organizationId: string): Promise<void> {
    await this.ask('access_roles_ensure_builtins', () =>
      sendRpc(this.auth, accessRolesEnsureBuiltIns, { organizationId }),
    );
  }

  async create(organizationId: string, role: SpaceRoleWrite & { name: string; slug: string }) {
    const r = await this.ask('space_role_create', () => sendRpc(this.auth, spaceRoleCreate, { organizationId, role }));
    if (!r.success || !r.data) throw new ServiceUnavailableException(r.message ?? 'The role could not be created.');
    return r.data;
  }

  async update(organizationId: string, roleId: string, patch: SpaceRoleWrite) {
    const r = await this.ask('space_role_update', () =>
      sendRpc(this.auth, spaceRoleUpdate, { organizationId, roleId, patch }),
    );
    if (!r.success || !r.data) throw new NotFoundException(r.message ?? 'Space role not found');
    return r.data;
  }
}
