/**
 * The answer most auth-service handlers give: `{ success, data }`, or a refusal
 * `{ success: false, statusCode, message, code?, params? }` (see assertServiceOk).
 * A reply type states only what the gateway READS — the rest of the answer is
 * passed on to the client untouched.
 */
export interface AuthServiceReply<T = unknown> {
  success?: boolean;
  data?: T;
  message?: string | string[];
  statusCode?: number;
  code?: string;
}
