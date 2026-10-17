import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tabAccessFor } from '../../lib/tab-layout';
import { LocationPickerSheet } from '../index';
import type { useClockIn } from '../../hooks/useClockIn';
import type { useJob } from './use-job';
import type { useJobWrites } from './use-job-writes';
import type { useCrew } from './use-crew';
import type { JobFile } from './job-files';
import type { MoreOption } from './job-logic';
import { MoreSheet } from './sheets/more-sheet';
import { ReportIssueSheet } from './sheets/report-issue-sheet';
import { JobConfirmSheet } from './sheets/confirm-sheet';
import { ClockInToStartSheet } from './sheets/clock-in-to-start-sheet';
import { HandoverSheet } from './sheets/handover-sheet';
import { HandOverLeadSheet, MyIssueSheet } from './job-crew';
import { AssignSheet } from './sheets/assign-sheet';
import { EditSheet } from './sheets/edit-sheet';
import { StepFormSheet } from './sheets/step-form-sheet';
import { SignSheet } from './sheets/sign-sheet';

export type SheetKind =
  | 'more'
  | 'issue'
  | 'decline'
  | 'cancel'
  | 'assign'
  | 'edit'
  | 'form'
  | 'sign'
  | 'delete'
  | 'clockIn'
  | 'handover'
  | 'myIssue'
  | 'handOverLead';

type Task = NonNullable<ReturnType<typeof useJob>['task']>;
type StepForm = Parameters<ReturnType<typeof useJobWrites>['moveWithForm']>[1];

/** Every sheet of `JobPage` — moved here unchanged; the page's own values come in as props. */
export function JobPageSheets({
  sheet,
  setSheet,
  closeSheet,
  setStartAfterClockIn,
  clockIn,
  crew,
  task,
  writes,
  user,
  options,
  labelOf,
  pick,
  deleting,
  setDeleting,
  formTarget,
  activeForm,
  formErrors,
  setFormErrors,
}: {
  sheet: SheetKind | null;
  setSheet: (s: SheetKind | null) => void;
  closeSheet: () => void;
  setStartAfterClockIn: (to: string | null) => void;
  clockIn: ReturnType<typeof useClockIn>;
  crew: ReturnType<typeof useCrew>;
  task: Task;
  writes: ReturnType<typeof useJobWrites>;
  user: unknown;
  options: MoreOption[];
  labelOf: (key: string) => string;
  pick: (o: MoreOption) => void;
  deleting: JobFile | null;
  setDeleting: (f: JobFile | null) => void;
  formTarget: string | null;
  activeForm: StepForm | null;
  formErrors: Record<string, string> | null;
  setFormErrors: (e: Record<string, string> | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {/* ⚠️ ONE sheet state — two can never be asked for at once. */}
      <ClockInToStartSheet
        visible={sheet === 'clockIn'}
        onClose={() => {
          setStartAfterClockIn(null);
          closeSheet();
        }}
        jobTitle={[task.title, task.space?.name].filter(Boolean).join(' · ')}
        busy={clockIn.isBusy || writes.busy}
        onClockIn={clockIn.openClockInModal}
      />
      <LocationPickerSheet {...clockIn.pickerProps} confirmDisabled={clockIn.isClockingIn} />
      <MyIssueSheet visible={sheet === 'myIssue'} onClose={closeSheet} busy={crew.busy} onSend={crew.reportMine} />
      <HandOverLeadSheet visible={sheet === 'handOverLead'} onClose={closeSheet} crew={crew} jobTitle={task.title} />
      <HandoverSheet
        visible={sheet === 'handover'}
        onClose={closeSheet}
        context={[task.title, task.space?.name].filter(Boolean).join(' · ')}
        busy={writes.busy}
        onSend={writes.handover}
      />
      <MoreSheet
        visible={sheet === 'more'}
        onClose={closeSheet}
        title={task.title}
        options={options}
        labelOf={labelOf}
        assigned={!!task.assignedToId}
        onPick={pick}
        onChat={
          tabAccessFor(user as never).chat
            ? () => {
                closeSheet();
                router.push({ pathname: '/chat', params: { taskId: task.id } } as never);
              }
            : undefined
        }
      />
      <ReportIssueSheet
        visible={sheet === 'issue'}
        onClose={closeSheet}
        context={[task.title, task.space?.name].filter(Boolean).join(' · ')}
        busy={writes.busy}
        onSend={writes.reportIssue}
      />
      <JobConfirmSheet
        visible={sheet === 'decline'}
        onClose={closeSheet}
        title={t('job.decline.title')}
        body={t('job.decline.body')}
        confirmLabel={t('job.decline.confirm')}
        busy={writes.busy}
        onConfirm={() => {
          setSheet(null);
          void writes.decline();
        }}
      />
      <JobConfirmSheet
        visible={sheet === 'cancel'}
        onClose={closeSheet}
        title={t('job.cancel.title')}
        body={t('job.cancel.body')}
        confirmLabel={t('job.cancel.confirm')}
        busy={writes.busy}
        onConfirm={() => {
          setSheet(null);
          void writes.cancelJob();
        }}
      />
      <JobConfirmSheet
        visible={sheet === 'delete'}
        onClose={() => {
          setSheet(null);
          setDeleting(null);
        }}
        title={t('job.files.deleteTitle')}
        body={t('job.files.deleteBody', { name: deleting?.fileName ?? '' })}
        confirmLabel={t('common.delete')}
        busy={false}
        onConfirm={() => {
          const f = deleting;
          setSheet(null);
          setDeleting(null);
          if (f) void writes.deleteAttachment(f.id);
        }}
      />
      <AssignSheet
        visible={sheet === 'assign'}
        current={task.assignedToId}
        spaceId={task.space?.id ?? null}
        busy={writes.busy}
        onPick={async (m) => {
          if (await writes.assign(m)) setSheet(null);
        }}
        onClose={closeSheet}
      />
      <EditSheet
        visible={sheet === 'edit'}
        onClose={closeSheet}
        initial={{
          title: task.title,
          description: task.description,
          priority: task.priority,
          locationAddress: task.locationAddress,
        }}
        busy={writes.busy}
        onSave={writes.edit}
      />
      <StepFormSheet
        visible={sheet === 'form' && !!activeForm}
        onClose={closeSheet}
        title={formTarget ? labelOf(formTarget) : ''}
        form={activeForm}
        busy={writes.busy}
        serverErrors={formErrors}
        onSubmit={async (draft, signatures) => {
          if (!formTarget || !activeForm) return false;
          setFormErrors(null);
          const res = await writes.moveWithForm(formTarget, activeForm, draft, signatures);
          if (!res.ok) setFormErrors(res.fieldErrors ?? null);
          return res.ok;
        }}
      />
      <SignSheet visible={sheet === 'sign'} onClose={closeSheet} busy={writes.uploading} onSave={writes.addSignature} />
    </>
  );
}
