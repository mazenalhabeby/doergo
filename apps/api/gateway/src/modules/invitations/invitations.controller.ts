import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { Role } from '@doergo/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators';
import {
  CurrentUser,
  CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import {
  CreateInvitationDto,
  AcceptInvitationDto,
  ListInvitationsDto,
} from './dto';

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create an invitation code (ADMIN/DISPATCHER)' })
  @ApiResponse({ status: 201, description: 'Invitation created with code' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'create_invitation' }, {
        ...dto,
        organizationId: user.organizationId,
        createdById: user.id,
        creatorRole: user.role,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return result;
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'List organization invitations (ADMIN/DISPATCHER)' })
  @ApiResponse({ status: 200, description: 'Invitations list' })
  async list(
    @Query() query: ListInvitationsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'list_invitations' }, {
        ...query,
        organizationId: user.organizationId,
      }),
    );
  }

  @Public()
  @Get('validate/:code')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Validate an invitation code (Public)' })
  @ApiParam({ name: 'code', description: 'Invitation code to validate' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validate(@Param('code') code: string) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'validate_invitation' }, { code }),
    );
  }

  @Public()
  @Post('accept')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Accept invitation and register new account (Public)' })
  @ApiResponse({ status: 201, description: 'Account created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async accept(@Body() dto: AcceptInvitationDto) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'accept_invitation' }, dto),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return result;
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Revoke an invitation (ADMIN/DISPATCHER)' })
  @ApiParam({ name: 'id', description: 'Invitation ID to revoke' })
  @ApiResponse({ status: 200, description: 'Invitation revoked' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'revoke_invitation' }, {
        invitationId: id,
        organizationId: user.organizationId,
        userId: user.id,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return result;
  }
}
