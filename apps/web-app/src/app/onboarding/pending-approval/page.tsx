'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Hourglass, Building2, XCircle, LogOut } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { notify } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { onboardingApi } from '@/lib/api';

const POLL_INTERVAL = 30_000;

export default function PendingApprovalPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { refreshUser, logout } = useAuth();

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const [orgName, setOrgName] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  const [status, setStatus] = useState<'pending' | 'rejected'>('pending');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isCanceling, setIsCanceling] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await onboardingApi.getStatus();
        if (!active) return;
        if (!result.needsOnboarding) {
          await refreshUser();
          router.replace('/dashboard');
          return;
        }
        const req = result.pendingRequest;
        if (req) {
          setOrgName(req.organizationName);
          setRequestMessage(req.message || '');
          setRequestId(req.id);
          if (req.status === 'APPROVED') {
            await refreshUser();
            if (active) router.replace('/dashboard');
          } else if (req.status === 'REJECTED') {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus('rejected');
            setRejectionReason(req.rejectionReason || '');
          }
        } else if (!result.hasPendingJoinRequest) {
          router.replace('/onboarding');
        }
      } catch {
        // Non-fatal: keep polling.
      }
    };

    load();
    pollRef.current = setInterval(load, POLL_INTERVAL);
    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshUser, router]);

  const handleCancel = async () => {
    if (!requestId) return;
    setIsCanceling(true);
    try {
      await onboardingApi.cancelJoinRequest(requestId);
      router.replace('/onboarding');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('onboarding.pendingApproval.failedToCancel'));
      setIsCanceling(false);
    }
  };

  const rejected = status === 'rejected';

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
      <div
        className={`mb-6 flex h-24 w-24 items-center justify-center rounded-full ${
          rejected ? 'bg-red-100' : 'bg-blue-100'
        }`}
      >
        {rejected ? (
          <XCircle className="h-12 w-12 text-red-600" />
        ) : (
          <Hourglass className="h-12 w-12 text-blue-600" />
        )}
      </div>

      <h1 className="text-2xl font-semibold text-slate-900">
        {rejected ? t('onboarding.pendingApproval.rejectedTitle') : t('onboarding.pendingApproval.waitingTitle')}
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500">
        {rejected ? t('onboarding.pendingApproval.rejectedSubtitle') : t('onboarding.pendingApproval.waitingSubtitle')}
      </p>

      {orgName && (
        <div className="mt-5 flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5">
          <Building2 className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">{orgName}</span>
        </div>
      )}

      {requestMessage && (
        <div className="mt-4 w-full rounded-lg border border-slate-200 bg-white p-3 text-left">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">
            {t('onboarding.pendingApproval.yourMessage')}
          </p>
          <p className="text-sm italic text-slate-600">{requestMessage}</p>
        </div>
      )}

      {rejected && rejectionReason && (
        <div className="mt-4 flex w-full items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-left">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{rejectionReason}</p>
        </div>
      )}

      {!rejected && (
        <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
          <Spinner size="sm" />
          {t('onboarding.pendingApproval.checking')}
        </div>
      )}

      <div className="mt-8 flex w-full flex-col items-center gap-3">
        {rejected ? (
          <Button
            type="button"
            onClick={() => router.replace('/onboarding')}
            className="h-11 w-full bg-blue-600 font-semibold text-white hover:bg-blue-700"
          >
            {t('onboarding.pendingApproval.tryDifferentPath')}
          </Button>
        ) : (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCanceling}
            className="text-sm font-semibold text-red-600 transition-colors hover:text-red-700 disabled:opacity-50"
          >
            {isCanceling ? t('common.loading') : t('onboarding.pendingApproval.cancelRequest')}
          </button>
        )}

        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t('onboarding.pendingApproval.logOut')}
        </button>
      </div>
    </div>
  );
}
