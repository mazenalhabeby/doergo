import React, { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/island/island-context';
import { useAccess } from '@/permissions/use-media-access';
import { canReadContacts, shareMoreContacts } from '@/lib/phone-contacts';
import { useContactsPermission } from '@/permissions/contacts-permission';
import { useCrmSpaces } from '@/hooks/use-crm-spaces';
import { useResponsive } from '@/lib/responsive';
import { Ground, HeaderBack, ScreenHeader } from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { useContactsImport, type ImportStep } from './use-contacts-import';
import { ExplainStep } from './explain-step';
import { PickStep } from './pick-step';
import { ReviewStep } from './review-step';
import { DoneStep } from './done-step';
import { personName } from '@hbcfield/shared/client';

/**
 * Clients from the phone's address book: explain → pick → check → done.
 *
 * ONE route, four steps, because they are one decision: "back" from the check
 * returns to the ticks as they were, not to the client list. The state lives
 * in `useContactsImport`; this file only decides which step is on screen.
 *
 * ⚠️ ONLINE ONLY, deliberately. A queued import would promise clients the
 * duplicate check has not seen — the same reason a role task's "Take" is.
 */
export function ContactsImportScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const params = useLocalSearchParams<{ spaceId?: string }>();
  const available = canReadContacts();

  const permission = useContactsPermission();
  const access = useAccess(permission);
  const limited = permission[0]?.accessPrivileges === 'limited';

  const spaces = useCrmSpaces();
  const [spaceId, setSpaceId] = useState<string | null>(params.spaceId ?? null);
  // One workspace runs CRM: it is the answer, nobody needs to be asked.
  useEffect(() => {
    if (!spaceId && spaces.length === 1) setSpaceId(spaces[0]!.id);
  }, [spaces, spaceId]);

  const [step, setStep] = useState<ImportStep>('explain');
  const state = useContactsImport({ organizationId: user?.organizationId ?? null, granted: access.granted });

  // Already allowed — the explanation was read the first time; go straight to the list.
  useEffect(() => {
    if (step === 'explain' && access.granted) setStep('pick');
  }, [access.granted, step]);

  const back = () => {
    if (step === 'review') setStep('pick');
    else router.back();
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step !== 'review') return false;
      setStep('pick');
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const importNow = async () => {
    if (!spaceId) return;
    try {
      await state.runImport(spaceId);
      setStep('done');
    } catch (e) {
      toast.error((e as Error)?.message || t('contactsImport.done.failed'));
    }
  };

  const importerName = personName(user);
  const spaceName = spaces.find((s) => s.id === spaceId)?.name ?? '';

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('contactsImport.title')}
        subtitle={spaceName || undefined}
        leading={<HeaderBack onPress={back} />}
        showAvatar={false}
        style={wide ?? undefined}
      />
      <View style={[{ flex: 1 }, wide]}>
        {step === 'explain' ? (
          <ExplainStep
            access={access}
            available={available}
            importerName={importerName}
            onCancel={() => router.back()}
            onContinue={async () => { if (await access.ask()) setStep('pick'); }}
          />
        ) : step === 'pick' ? (
          <PickStep state={state} limited={limited} onShareMore={() => void shareMoreContacts()} onNext={() => setStep('review')} />
        ) : step === 'review' ? (
          <ReviewStep state={state} spaces={spaces} spaceId={spaceId} onSpace={setSpaceId} onImport={() => void importNow()} />
        ) : state.result ? (
          <DoneStep
            result={state.result}
            spaceName={spaceName}
            onOpen={() => router.back()}
            onMore={() => { state.again(); setStep('pick'); }}
          />
        ) : null}
      </View>
    </Ground>
  );
}
