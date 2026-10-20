/**
 * The package root: everything — what the apps may load (./client) plus what only the services load (./server).
 * Add a new export to ONE of those two files, never here (docs/plans/code-structure-fix.md, Phase 2.1).
 */
export * from './client';
export * from './server';
