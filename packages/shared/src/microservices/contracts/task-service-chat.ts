import { rpc } from '../contract';
import type { ChatActorMessage } from './task-service-types';

/** task-service `chat` handlers — the request each one reads. */

export const chatContacts = rpc<{ userId: string; organizationId: string }>('chat.contacts');
export const chatOpenDirect = rpc<{ organizationId: string; userId: string; otherUserId: string }>('chat.openDirect');
export const chatListConversations = rpc<{ userId: string; organizationId: string }>('chat.listConversations');
export const chatHistory = rpc<{
  conversationId: string;
  userId: string;
  before?: string;
  limit?: number;
  facts?: {
    userId: string;
    userRole: string;
    organizationId: string;
    canViewAllTasks?: boolean;
    sharedSpaceIds?: string[];
    viewAllSpaceIds?: string[];
  };
}>('chat.history');
export const chatSend = rpc<{
  conversationId: string;
  senderId: string;
  body: string;
  attachments?: unknown[];
  id?: string;
  sentAt?: string;
  facts?: {
    userId: string;
    userRole: string;
    organizationId: string;
    canViewAllTasks?: boolean;
    sharedSpaceIds?: string[];
    viewAllSpaceIds?: string[];
  };
}>('chat.send');
export const chatBadge = rpc<{ userId: string }>('chat.badge');
export const chatMarkRead = rpc<{ conversationId: string; userId: string }>('chat.markRead');
export const chatMute = rpc<{ conversationId: string; userId: string; until: null | string }>('chat.mute');
export const chatEdit = rpc<{
  messageId: string;
  userId: string;
  body: string;
  facts?: {
    userId: string;
    userRole: string;
    organizationId: string;
    canViewAllTasks?: boolean;
    sharedSpaceIds?: string[];
    viewAllSpaceIds?: string[];
  };
}>('chat.edit');
export const chatRemove = rpc<{
  messageId: string;
  userId: string;
  facts?: {
    userId: string;
    userRole: string;
    organizationId: string;
    canViewAllTasks?: boolean;
    sharedSpaceIds?: string[];
    viewAllSpaceIds?: string[];
  };
}>('chat.remove');
export const chatPresignAttachment = rpc<{
  conversationId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  facts?: {
    userId: string;
    userRole: string;
    organizationId: string;
    canViewAllTasks?: boolean;
    sharedSpaceIds?: string[];
    viewAllSpaceIds?: string[];
  };
}>('chat.presignAttachment');
export const chatCapabilities = rpc<{ userId: string }>('chat.capabilities');
export const chatCreateGroup = rpc<ChatActorMessage & { title: unknown; memberIds: unknown }>('chat.createGroup');
export const chatRenameGroup = rpc<ChatActorMessage & { conversationId: string; title: unknown }>('chat.renameGroup');
export const chatAddMembers = rpc<ChatActorMessage & { conversationId: string; userIds: unknown }>('chat.addMembers');
export const chatRemoveMember = rpc<ChatActorMessage & { conversationId: string; targetId: string }>(
  'chat.removeMember',
);
export const chatLeaveGroup = rpc<ChatActorMessage & { conversationId: string }>('chat.leaveGroup');
export const chatOpenTask = rpc<
  {
    userId: string;
    userRole: string;
    organizationId: string;
    canViewAllTasks?: boolean;
    sharedSpaceIds?: string[];
    viewAllSpaceIds?: string[];
  } & { taskId: string }
>('chat.openTask');
export const chatSearch = rpc<{ userId: string; organizationId: string; q: unknown; before?: string; limit?: unknown }>(
  'chat.search',
);
export const chatReachableIds = rpc<{ userId: string; organizationId: string }>('chat.reachableIds');
