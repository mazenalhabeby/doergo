import { useShiftIssueThreadSheet } from './use-shift-issue-thread-sheet';

/** ShiftIssueThreadSheet's state and handlers — everything before its markup, moved here unchanged. */
export function useShiftIssueThreadSheetLogic({
  visible,
  onClose,
  issueId,
  canManage,
  currentUserId,
}: Pick<{
  visible: boolean;
  onClose: () => void;
  issueId: string | null;
  canManage?: boolean;
  currentUserId?: string;
}, 'visible' | 'onClose' | 'issueId' | 'canManage' | 'currentUserId'>) {
  const vm = useShiftIssueThreadSheet({ visible, onClose, issueId, canManage, currentUserId });
  const {
    amazen,
    t,
    c,
    issue,
    failed,
    setFailed,
    draft,
    setDraft,
    picked,
    setPicked,
    busy,
    viewing,
    setViewing,
    ending,
    setEnding,
    reason,
    setReason,
    scrollRef,
    load,
    thread,
    send,
    addPhoto,
    act,
    viewerId,
    offered,
    look,
    tone,
  } = vm;

  return {
    vm,
    amazen,
    t,
    c,
    issue,
    failed,
    setFailed,
    picked,
    setPicked,
    viewing,
    setViewing,
    setEnding,
    scrollRef,
    load,
    thread,
    act,
    viewerId,
    offered,
    look,
    tone,
  };
}

/** What ShiftIssueThreadSheet and its sections read. */
export type ShiftIssueThreadSheetState = ReturnType<typeof useShiftIssueThreadSheetLogic>;
