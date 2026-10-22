import { OBJECT_STORE } from '@hbcfield/shared/storage';
import { MediaSigner } from '../../../common/storage/media-signer.service';
import { TaskAccessService } from '../../tasks/access/task-access.service';
import { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';

/**
 * Storage for chat specs: every key exists (1 KB) and signs to "signed:{key}".
 * Specs about files replace `head` to say otherwise.
 */
export function fakeObjectStore() {
  return {
    head: jest.fn(async () => ({ exists: true, sizeBytes: 1024 })),
    presignUpload: jest.fn(async (key: string) => ({ url: `put:${key}`, key, headers: {}, expiresInSeconds: 3600 })),
    mediaUrl: jest.fn(async (key: string) => `signed:${key}`),
    keyFromUrl: () => null,
    privateUrl: (key: string) => key,
  };
}

/**
 * The providers chat needs from outside its module, for a Nest testing module:
 * storage (ChatFilesService), and the job gate + flow cache (ChatTasksService —
 * the real gate over the spec's prisma; no custom flows unless a spec says so).
 */
export function chatStorageStubs(
  store = fakeObjectStore(),
  workflows: { getWorkflow: (...a: any[]) => Promise<any> } = { getWorkflow: async () => null },
) {
  return [
    { provide: OBJECT_STORE, useValue: store },
    MediaSigner,
    TaskAccessService,
    { provide: WorkflowConfigCache, useValue: workflows },
  ];
}
