import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { LinkOpenResult } from './types/sign-link';
import { signLinkEndpoints } from '@hbcfield/shared/client';

/*
  Every call is a POST, including the reads.

  The token must not appear in a URL: the gateway logs `${method} ${url}` on
  every request and the exception filter echoes the url back inside error
  bodies, so a token in the path would be written to stdout and returned to
  callers. In the body it falls under the existing redaction list. The page
  keeps it in a query string, which never leaves the browser.
*/
export const signLinkApi = {
  open: async (token: string): Promise<LinkOpenResult> => {
    const res = await call(signLinkEndpoints.open, undefined, { body: { token } }) as ApiResponse<{ success: boolean; data: LinkOpenResult }>
    if (res.error) throw apiError(res)
    return (res.data?.data ?? { ok: false, refusal: "unknown" }) as LinkOpenResult
  },

  file: async (token: string, signerId: string) => {
    const res = await call(signLinkEndpoints.file, undefined, { body: { token, signerId } }) as ApiResponse<{ success: boolean; data: { ok: boolean; url?: string } }>
    if (res.error) throw apiError(res)
    return res.data?.data
  },

  sign: async (data: {
    token: string
    signerIds: string[]
    signatureImage: string
    name: string
    role?: string | null
    idempotencyKey: string
  }) => {
    const res = await call(signLinkEndpoints.submit, undefined, { body: data }) as ApiResponse<{ success: boolean; data: { ok: boolean; signed: number; failed: unknown[] } }>
    if (res.error) throw apiError(res)
    return res.data?.data
  },

  /** Always resolves the same way, whatever the server found. */
  resend: async (email: string) => {
    await call(signLinkEndpoints.resend, undefined, { body: { email } }) as ApiResponse<unknown>
    return { ok: true }
  },
}
