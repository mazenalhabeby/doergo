export * from './contract';
// Rules and facts (server side — docs/plans/clock-attendance-2026-10.md step 2).
export * from './facts';
export * from './rules-time';
export * from './rules-position';
export * from './catalogue';
export * from './explain';
export * from './check';
export { LABEL_WORDS, labelWordsFor } from './words';
export type { LabelWords, ExplainWords } from './words';
