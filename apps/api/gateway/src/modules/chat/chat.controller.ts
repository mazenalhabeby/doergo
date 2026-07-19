import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { OpenDirectDto, SendMessageDto } from './dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('contacts')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Members you are allowed to message' })
  contacts(@Req() req: any) {
    return this.chat.contacts({ userId: req.user.id, organizationId: req.user.organizationId });
  }

  @Get('conversations')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'My conversations (with last message + unread)' })
  conversations(@Req() req: any) {
    return this.chat.listConversations({ userId: req.user.id, organizationId: req.user.organizationId });
  }

  @Post('conversations')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Open (or create) a 1:1 conversation with a member' })
  openDirect(@Body() dto: OpenDirectDto, @Req() req: any) {
    return this.chat.openDirect({
      userId: req.user.id,
      otherUserId: dto.userId,
      organizationId: req.user.organizationId,
    });
  }

  @Get('conversations/:id/messages')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Message history (paginated via ?before=ISO)' })
  history(@Param('id') id: string, @Query('before') before: string, @Query('limit') limit: string, @Req() req: any) {
    return this.chat.history({ conversationId: id, userId: req.user.id, before, limit });
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Send a message' })
  sendMessage(@Param('id') id: string, @Body() dto: SendMessageDto, @Req() req: any) {
    return this.chat.send_({
      conversationId: id,
      senderId: req.user.id,
      body: dto.body,
      attachments: dto.attachments,
    });
  }

  @Post('conversations/:id/read')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Mark a conversation read' })
  markRead(@Param('id') id: string, @Req() req: any) {
    return this.chat.markRead({ conversationId: id, userId: req.user.id });
  }
}
