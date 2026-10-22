import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  addAssetRow,
  assetLogCreate,
  assetLogDueMine,
  assetLogList,
  assetLogMine,
  assetLogPresign,
  assetLogRemove,
  assetLogSummary,
  listAssetRows,
  removeAssetRow,
  updateAssetRow,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
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

  @MessagePattern(pattern(assetLogPresign))
  async logPresign(@Payload() data: RpcRequest<typeof assetLogPresign>) {
    return this.logs.presign(data);
  }

  @MessagePattern(pattern(assetLogCreate))
  async logCreate(@Payload() data: RpcRequest<typeof assetLogCreate>) {
    return this.logs.create(data);
  }

  @MessagePattern(pattern(assetLogList))
  async logList(@Payload() data: RpcRequest<typeof assetLogList>) {
    return this.logReads.list(data);
  }

  @MessagePattern(pattern(assetLogSummary))
  async logSummary(@Payload() data: RpcRequest<typeof assetLogSummary>) {
    return this.logReads.summary(data);
  }

  @MessagePattern(pattern(assetLogMine))
  async logMine(@Payload() data: RpcRequest<typeof assetLogMine>) {
    return this.logReads.mine(data);
  }

  @MessagePattern(pattern(assetLogDueMine))
  async logDueMine(@Payload() data: RpcRequest<typeof assetLogDueMine>) {
    return this.logReads.dueMine(data);
  }

  @MessagePattern(pattern(assetLogRemove))
  async logRemove(@Payload() data: RpcRequest<typeof assetLogRemove>) {
    return this.logs.remove(data);
  }

  @MessagePattern(pattern(listAssetRows))
  async listRows(@Payload() data: RpcRequest<typeof listAssetRows>) {
    return this.rows.listRows(data);
  }

  @MessagePattern(pattern(addAssetRow))
  async addRow(@Payload() data: RpcRequest<typeof addAssetRow>) {
    return this.rows.addRow(data);
  }

  @MessagePattern(pattern(updateAssetRow))
  async updateRow(@Payload() data: RpcRequest<typeof updateAssetRow>) {
    return this.rows.updateRow(data);
  }

  @MessagePattern(pattern(removeAssetRow))
  async removeRow(@Payload() data: RpcRequest<typeof removeAssetRow>) {
    return this.rows.removeRow(data);
  }
}
