import { useEffect, useRef, useState } from 'react';
import type { RequestPrecheck } from '@hbcfield/shared/client';
import { requestsApi } from '@/lib/api/technicians';

/**
 * The pre-check for a request being filled in — asked once the form has been
 * still for a moment, never on every keystroke, and only for a body the
 * server's own parser would accept. The latest answer wins (an older reply
 * arriving late is dropped). Null while unknown or offline: the form says
 * nothing rather than guess.
 */
export function useRequestPrecheck(body: Record<string, unknown> | null): RequestPrecheck | null {
  const [result, setResult] = useState<RequestPrecheck | null>(null);
  const seq = useRef(0);
  // The reason does not change the answer; leaving it out stops a re-ask while typing.
  const key = body ? JSON.stringify({ ...body, reason: undefined, id: undefined }) : '';

  useEffect(() => {
    if (!body) { setResult(null); return; }
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      void requestsApi.precheck(body).then((r) => { if (seq.current === mine) setResult(r); });
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result;
}
