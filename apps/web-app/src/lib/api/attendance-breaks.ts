import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { BreakRuleRow } from './types/attendance';
import { attendanceEndpoints } from '@hbcfield/shared/client';

/** Rests: taking and ending one, the prompt, the workspace rules. Part of `attendanceApi`, moved here unchanged. */
export const attendanceBreaksApi = {
  /** Start a rest. `ruleId` says which planned one; omit for whichever is next. */
  startBreak: async (input?: { ruleId?: string; type?: string; notes?: string }) => {
    const response = await call(
      attendanceEndpoints.startBreak,
      undefined,
      { body: input ?? {} }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (response.error) throw apiError(response);
    return (response.data as { data?: unknown })?.data ?? response.data;
  },

  /** End the rest in progress. */
  endBreak: async (input?: { notes?: string }) => {
    const response = await call(
      attendanceEndpoints.endBreak,
      undefined,
      { body: input ?? {} }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (response.error) throw apiError(response);
    return (response.data as { data?: unknown })?.data ?? response.data;
  },

  /** "Later." The count is kept server-side, so this is a real answer. */
  snoozeBreak: async (input?: { ruleId?: string }) => {
    const response = await call(
      attendanceEndpoints.snoozeBreak,
      undefined,
      { body: input ?? {} }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (response.error) throw apiError(response);
    return (response.data as { data?: unknown })?.data ?? response.data;
  },

  // ── Rest rules: what a workspace expects ─────────────────────────────────

  listBreakRules: async (params?: { spaceId?: string; shiftId?: string }) => {
    const response = await call(
      attendanceEndpoints.breakRules,
      undefined,
      { query: params ?? {} }) as ApiResponse<{ success: boolean; data: BreakRuleRow[] }>;
    if (response.error) throw apiError(response);
    return ((response.data as { data?: BreakRuleRow[] })?.data ?? []) as BreakRuleRow[];
  },

  createBreakRule: async (input: Partial<BreakRuleRow>) => {
    const response = await call(
      attendanceEndpoints.createBreakRule,
      undefined,
      { body: input }) as ApiResponse<{ success: boolean; data: BreakRuleRow }>;
    if (response.error) throw apiError(response);
    return (response.data as { data?: BreakRuleRow })?.data;
  },

  updateBreakRule: async (id: string, input: Partial<BreakRuleRow>) => {
    const response = await call(
      attendanceEndpoints.updateBreakRule,
      { id },
      { body: input }) as ApiResponse<{ success: boolean; data: BreakRuleRow }>;
    if (response.error) throw apiError(response);
    return (response.data as { data?: BreakRuleRow })?.data;
  },

  deleteBreakRule: async (id: string) => {
    const response = await call(attendanceEndpoints.removeBreakRule, { id }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
    return true;
  },
};
