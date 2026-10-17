import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AssetRowsService } from './asset-rows.service';
import { AssetLogService } from './asset-log.service';
import { AssetLogReadService } from './asset-log-read.service';

/** Assets over RPC: the logbook and a record's rows. */
@Controller()
export class AssetLogRpcController {
  constructor(
    private readonly rows: AssetRowsService,
    private readonly logs: AssetLogService,
    private readonly logReads: AssetLogReadService,
  ) {}

  // ============================================
  // LOGBOOK — what gets done to a thing, and when it is due again
  // ============================================

  @MessagePattern({ cmd: 'asset_log_presign' })
  async logPresign(@Payload() data: any) {
    return this.logs.presign(data);
  }

  @MessagePattern({ cmd: 'asset_log_create' })
  async logCreate(@Payload() data: any) {
    return this.logs.create(data);
  }

  @MessagePattern({ cmd: 'asset_log_list' })
  async logList(@Payload() data: any) {
    return this.logReads.list(data);
  }

  @MessagePattern({ cmd: 'asset_log_summary' })
  async logSummary(@Payload() data: any) {
    return this.logReads.summary(data);
  }

  @MessagePattern({ cmd: 'asset_log_mine' })
  async logMine(@Payload() data: any) {
    return this.logReads.mine(data);
  }

  @MessagePattern({ cmd: 'asset_log_due_mine' })
  async logDueMine(@Payload() data: any) {
    return this.logReads.dueMine(data);
  }

  @MessagePattern({ cmd: 'asset_log_remove' })
  async logRemove(@Payload() data: any) {
    return this.logs.remove(data);
  }

  @MessagePattern({ cmd: 'list_asset_rows' })
  async listRows(@Payload() data: any) {
    return this.rows.listRows(data);
  }

  @MessagePattern({ cmd: 'add_asset_row' })
  async addRow(@Payload() data: any) {
    return this.rows.addRow(data);
  }

  @MessagePattern({ cmd: 'update_asset_row' })
  async updateRow(@Payload() data: any) {
    return this.rows.updateRow(data);
  }

  @MessagePattern({ cmd: 'remove_asset_row' })
  async removeRow(@Payload() data: any) {
    return this.rows.removeRow(data);
  }
}
