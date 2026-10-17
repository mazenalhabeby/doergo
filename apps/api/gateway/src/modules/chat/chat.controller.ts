import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import {
  AddMembersDto,
  ChatPresignDto,
  ChatSearchQueryDto,
  CreateGroupDto,
  EditMessageDto,
  MuteConversationDto,
  OpenDirectDto,
  RenameGroupDto,
  SendMessageDto,
} from './dto';
import { taskActor } from '../../common/task-actor';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('contacts')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Members you are allowed to message' })
  contacts(@Req() req: AuthedRequest) {
    return this.chat.contacts({ userId: req.user.id, organizationId: callerOrgId(req.user) });
  }

  @Get('conversations')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'My conversations (with last message + unread)' })
  conversations(@Req() req: AuthedRequest) {
    return this.chat.listConversations({ userId: req.user.id, organizationId: callerOrgId(req.user) });
  }

  @Get('badge')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'My unread total across every conversation (for a badge)' })
  badge(@Req() req: AuthedRequest) {
    return this.chat.badge({ userId: req.user.id });
  }

  @Post('conversations')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Open (or create) a 1:1 conversation with a member' })
  openDirect(@Body() dto: OpenDirectDto, @Req() req: AuthedRequest) {
    return this.chat.openDirect({
      userId: req.user.id,
      otherUserId: dto.userId,
      organizationId: callerOrgId(req.user),
    });
  }

  @Get('conversations/:id/messages')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Message history (paginated via ?before=ISO)' })
  history(
    @Param('id') id: string,
    @Query('before') before: string,
    @Query('limit') limit: string,
    @Req() req: AuthedRequest,
  ) {
    // ⚠️ Contract mismatch, kept as it is: `limit` travels as the query's string; the handler declares a number.
    const wireLimit = limit as unknown as number;
    return this.chat.history({
      conversationId: id,
      userId: req.user.id,
      before,
      limit: wireLimit,
      facts: taskActor(req),
    });
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Send a message' })
  sendMessage(@Param('id') id: string, @Body() dto: SendMessageDto, @Req() req: AuthedRequest) {
    return this.chat.send_({
      id: dto.id,
      sentAt: dto.sentAt,
      body: dto.body,
      attachments: dto.attachments,
      conversationId: id,
      senderId: req.user.id,
      // Asked only in a job's chat: the office writes there through the job gate.
      facts: taskActor(req),
    });
  }

  @Post('conversations/:id/read')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Mark a conversation read' })
  markRead(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.chat.markRead({ conversationId: id, userId: req.user.id });
  }

  @Post('conversations/:id/attachments/presign')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'An upload link for one file into a conversation' })
  presign(@Param('id') id: string, @Body() dto: ChatPresignDto, @Req() req: AuthedRequest) {
    return this.chat.presignAttachment({
      conversationId: id,
      userId: req.user.id,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      facts: taskActor(req),
    });
  }

  @Patch('conversations/:id/mute')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: "Turn this conversation's pushes off until a moment (null = on)" })
  mute(@Param('id') id: string, @Body() dto: MuteConversationDto, @Req() req: AuthedRequest) {
    return this.chat.mute({ conversationId: id, userId: req.user.id, until: dto.until ?? null });
  }

  @Patch('messages/:id')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Edit your own message (for 15 minutes after sending)' })
  edit(@Param('id') id: string, @Body() dto: EditMessageDto, @Req() req: AuthedRequest) {
    return this.chat.edit({ messageId: id, userId: req.user.id, body: dto.body, facts: taskActor(req) });
  }

  @Delete('messages/:id')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Remove your own message (for 15 minutes after sending)' })
  remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.chat.remove({ messageId: id, userId: req.user.id, facts: taskActor(req) });
  }

  // ── groups (phase 3, D3) ──────────────────────────────────────────────────

  @Get('capabilities')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'What the caller may do in chat (start a group)' })
  capabilities(@Req() req: AuthedRequest) {
    return this.chat.capabilities({ userId: req.user.id });
  }

  @Post('groups')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Start a group — managers and leaders, with people they may message' })
  createGroup(@Body() dto: CreateGroupDto, @Req() req: AuthedRequest) {
    return this.chat.createGroup({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      title: dto.title,
      memberIds: dto.memberIds,
    });
  }

  @Patch('groups/:id')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Rename a group (its creator, or a manager)' })
  renameGroup(@Param('id') id: string, @Body() dto: RenameGroupDto, @Req() req: AuthedRequest) {
    return this.chat.renameGroup({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      conversationId: id,
      title: dto.title,
    });
  }

  @Post('groups/:id/members')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Add people to a group (its creator, or a manager)' })
  addMembers(@Param('id') id: string, @Body() dto: AddMembersDto, @Req() req: AuthedRequest) {
    return this.chat.addMembers({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      conversationId: id,
      userIds: dto.userIds,
    });
  }

  @Delete('groups/:id/members/:userId')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Take somebody out of a group (its creator, or a manager)' })
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @Req() req: AuthedRequest) {
    return this.chat.removeMember({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      conversationId: id,
      targetId: userId,
    });
  }

  @Post('groups/:id/leave')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Leave a group' })
  leaveGroup(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.chat.leaveGroup({ userId: req.user.id, organizationId: callerOrgId(req.user), conversationId: id });
  }

  // ── a job's chat (phase 3, D4) ────────────────────────────────────────────

  @Post('tasks/:taskId')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: "Open (or create) a job's chat — its crew, and the office through the job gate (404 otherwise)",
  })
  openTask(@Param('taskId') taskId: string, @Req() req: AuthedRequest) {
    return this.chat.openTask({ ...taskActor(req), taskId });
  }

  // ── search (phase 3) ──────────────────────────────────────────────────────

  @Get('search')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Words in my own conversations, newest first (paged by ?before=createdAt|id)' })
  search(@Query() query: ChatSearchQueryDto, @Req() req: AuthedRequest) {
    return this.chat.search({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      q: query.q,
      before: query.before,
    });
  }
}
