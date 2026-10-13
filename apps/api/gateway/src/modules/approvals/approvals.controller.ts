import { Body, Controller, Get, HttpCode, HttpException, Post, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DecideApprovalDto } from './dto/decide.dto';
import { ApprovalsService } from './approvals.service';

/**
 * Everything waiting for the caller to decide, in one place — see
 * packages/shared/src/approvals. Any signed-in member may ask: what they get is
 * exactly what the thirteen existing lists give them, and a decision is
 * exactly the existing action, both run as them.
 */
@ApiTags('approvals')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: 'Everything waiting for the caller to decide, ordered by what cannot wait' })
  async list(@Request() req: any) {
    return { success: true, data: await this.approvals.list(caller(req)) };
  }

  @Get('count')
  @ApiOperation({ summary: 'How many decisions wait for the caller (cached ~20 s)' })
  async count(@Request() req: any) {
    return { success: true, data: await this.approvals.count(caller(req)) };
  }

  @Post('decide')
  @HttpCode(200)
  @ApiOperation({ summary: "Decide one item through its kind's existing route" })
  async decide(@Body() dto: DecideApprovalDto, @Request() req: any) {
    const r = await this.approvals.decide(caller(req), dto);
    if (!r.ok) throw new HttpException({ statusCode: r.status, message: r.message ?? r.code, code: r.code, params: r.params }, r.status);
    return { success: true, data: { decided: true } };
  }
}

function caller(req: any) {
  return { user: req.user, headers: req.headers, ip: req.ip };
}
