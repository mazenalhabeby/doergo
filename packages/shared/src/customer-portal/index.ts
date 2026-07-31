/**
 * @hbcfield/shared — customer-portal module.
 *
 * B2B2C portal domain: external customers (residents / recipients) submit
 * requests that flow into the existing task pipeline. Pure & client-safe — no
 * NestJS / Prisma / class-validator deps — so it re-exports from both index.ts
 * (backend) and client.ts (web + mobile).
 */
export * from './types';
export * from './templates';
export * from './helpers';
export * from './constants';
