/** task-service: the phone's offline sync. */
import { rpc } from '../contract';
import type { SyncPullRequest, TaskVisibilityFacts } from './task-service-types';

export const syncPull = rpc<SyncPullRequest>('sync_pull');

export const syncMediaLinks = rpc<TaskVisibilityFacts & { ids: string[] }>('sync_media_links');
