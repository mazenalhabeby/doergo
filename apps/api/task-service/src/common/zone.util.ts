/*
  Moved to shared (utils/workspace-zone.ts) so every service reads "today" in the
  same zone — auth-service's invoices dated a 00:30 issue the day before.
  Re-exported so existing imports keep working.
*/
export { workspaceZone } from '@hbcfield/shared';
