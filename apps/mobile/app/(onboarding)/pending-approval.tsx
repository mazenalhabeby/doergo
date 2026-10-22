import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { onboardingApi } from '@/lib/api';
import { ROUTES } from '@/lib/constants';
import { ConfirmSheet } from '@/components';
import { AText, PrimaryButton } from '@/components/amazen';
import { PassBadge } from '@/features/onboarding/pass-badge';
import { PassFrame } from '@/features/onboarding/pass-frame';
import { personName } from '@hbcfield/shared/client';

const POLL_INTERVAL = 30000;

/**
 * A request to join, waiting at reception — the same pass, stamped PENDING
 * while an admin decides and NOT ISSUED (with their reason) if they refuse.
 * It checks every 30 seconds and lets the member in the moment it is approved.
 */
export default function PendingApprovalScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { amazen } = useTheme();
  const c = amazen.color;
  const toast = useToast();
  const { t } = useTranslation();
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const [orgName, setOrgName] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  const [isCanceling, setIsCanceling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    void loadStatus();
    pollRef.current = setInterval(loadStatus, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStatus = async () => {
    try {
      const result = await onboardingApi.getStatus();
      if (!result.needsOnboarding) { await refreshUser(); return; }
      const req = result.pendingRequest;
      if (req) {
        setOrgName(req.organizationName);
        setRequestMessage(req.message || '');
        setRequestId(req.id);
        if (req.status === 'APPROVED') {
          setStatus('approved');
          toast.success(t('onboarding.pendingApproval.approvedToast'), req.organizationName);
          await refreshUser();
        } else if (req.status === 'REJECTED') {
          // Nothing more will change on its own — stop asking.
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = undefined; }
          setStatus('rejected');
          setRejectionReason(req.rejectionReason || '');
        }
      } else if (!result.hasPendingJoinRequest) {
        router.replace(ROUTES.choosePath as Href);
      }
    } catch (error) {
      console.error('Error polling status:', error);
    }
  };

  const confirmCancel = async () => {
    setIsCanceling(true);
    try {
      await onboardingApi.cancelJoinRequest(requestId);
      setShowCancelConfirm(false);
      router.replace(`${ROUTES.choosePath}?fresh=1` as Href);
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('onboarding.pendingApproval.failedToCancel'));
    } finally {
      setIsCanceling(false);
    }
  };

  const refused = status === 'rejected';
  const name = personName(user);
  const anotherCode = () => router.replace(`${ROUTES.choosePath}?fresh=1` as Href);

  return (
    <>
      <PassFrame
        heading={refused ? t('onboarding.pass.headingRefused') : t('onboarding.pass.headingWaiting')}
        dock={
          refused ? (
            <PrimaryButton label={t('onboarding.pass.tryAnother')} onPress={anotherCode} />
          ) : (
            <View style={{ gap: amazen.space(3) }}>
              <PrimaryButton label={t('onboarding.pass.haveAnother')} onPress={anotherCode} />
              {requestId ? (
                <Pressable
                  onPress={() => setShowCancelConfirm(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  style={{ alignSelf: 'center' }}>
                  <AText variant="body" style={{ color: c.critical, fontSize: 13.5 }}>
                    {t('onboarding.pendingApproval.cancelRequest')}
                  </AText>
                </Pressable>
              ) : null}
            </View>
          )
        }
      >
        <PassBadge
          face={refused ? 'refused' : 'reception'}
          strip={refused ? t('onboarding.pass.stripRefused') : t('onboarding.pass.stripReception')}
          company={orgName}
          name={name}
          role={refused
            ? (rejectionReason ? `“${rejectionReason}”` : t('onboarding.pass.refusedNoReason', { org: orgName }))
            : t('onboarding.pass.waitingFor', { org: orgName })}
          roleTone={refused ? 'critical' : 'warn'}
          footLeft="HBCFIELD"
          footRight={refused ? '' : t('onboarding.pass.checksEvery')}
          stamp={{
            text: refused ? t('onboarding.pass.stripRefused') : t('onboarding.pass.stampPending'),
            tone: refused ? 'critical' : 'warn',
          }}
        />
        {requestMessage && !refused ? (
          <View
            style={{
              backgroundColor: c.glass,
              borderWidth: 1,
              borderColor: c.lineGlass,
              borderRadius: 18,
              padding: amazen.space(3.5),
              gap: 4,
            }}>
            <AText
              style={{
                color: c.inkOnGlass,
                fontFamily: amazen.font.mono,
                fontSize: 10,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
              }}
            >
              {t('onboarding.pendingApproval.yourMessage')}
            </AText>
            <AText variant="body" tone="strong" style={{ fontSize: 14, lineHeight: 20 }}>{requestMessage}</AText>
          </View>
        ) : null}
      </PassFrame>

      <ConfirmSheet
        visible={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={confirmCancel}
        title={t('onboarding.pendingApproval.cancelRequestConfirmTitle')}
        message={t('onboarding.pendingApproval.cancelRequestConfirmMessage')}
        confirmLabel={t('onboarding.pendingApproval.cancelRequestConfirmYes')}
        cancelLabel={t('common.no')}
        variant="warning"
        isLoading={isCanceling}
      />
    </>
  );
}
