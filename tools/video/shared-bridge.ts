/**
 * The handful of constants the seed needs out of `@hbcfield/shared`, loaded
 * through its CommonJS build.
 *
 * ⚠️ WHY NOT A PLAIN `import { ADD_ON_KEYS } from '@hbcfield/shared'`.
 *
 * The shared package ships two builds. The ESM one (`dist-esm/`) is written
 * for bundlers: it uses directory imports (`./types`, no `/index.js`), which
 * webpack and Next resolve happily and Node's own ESM resolver refuses
 * outright with ERR_UNSUPPORTED_DIR_IMPORT. These scripts run on bare Node, so
 * the ESM entry is simply not loadable here. The CommonJS build is, and
 * `createRequire` is the supported way to reach it from an ES module.
 *
 * The alternative — copying the twelve add-on keys and the role table into
 * this directory — is worse in the way that matters: the video seed would
 * then grant a set of capabilities that silently stops matching the product
 * the moment somebody adds a module, and the first symptom would be a 402
 * halfway through a recording.
 *
 * ⚠️ Requires `pnpm --filter @hbcfield/shared build` to have run — the web app
 * reads the built `dist/` too, so this is the repo's normal precondition, not
 * a new one.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface SharedModule {
  ADD_ON_KEYS: readonly string[];
  DEFAULT_ORG_MODULES: readonly string[];
  BUILTIN_ROLES: ReadonlyArray<{
    slug: string;
    name: string;
    description?: string;
    color?: string;
    scope: string;
    permissions: Record<string, boolean>;
  }>;
  DEFAULT_WORKFLOW_TEMPLATE: {
    name: string;
    description?: string;
    statuses: Array<{
      name: string;
      key: string;
      color: string;
      icon: string;
      position: number;
      isFinal: boolean;
      isCanceled: boolean;
      transitions: string[];
      capabilities?: unknown;
    }>;
  };
}

function loadShared(): SharedModule {
  try {
    return require('@hbcfield/shared') as SharedModule;
  } catch (err) {
    throw new Error(
      'Could not load @hbcfield/shared. Build it first:\n' +
        '  pnpm --filter @hbcfield/shared build\n\n' +
        `Underlying error: ${(err as Error).message}`,
    );
  }
}

const shared = loadShared();

export const ADD_ON_KEYS = shared.ADD_ON_KEYS;
export const DEFAULT_ORG_MODULES = shared.DEFAULT_ORG_MODULES;
export const BUILTIN_ROLES = shared.BUILTIN_ROLES;
export const DEFAULT_WORKFLOW_TEMPLATE = shared.DEFAULT_WORKFLOW_TEMPLATE;
