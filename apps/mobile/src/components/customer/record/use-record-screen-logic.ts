import { useRecordScreen } from './use-record-screen';

/** RecordScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useRecordScreenLogic({ id, linkedTab }: Pick<{ id: string; linkedTab?: string }, 'id' | 'linkedTab'>) {
  const {
    amazen,
    c,
    t,
    toast,
    wide,
    m,
    record,
    spaceName,
    reminderRequest,
    askReminder,
    menu,
    setMenu,
    openMore,
    back,
    refresher,
    feedItems,
    renderFeed,
    renderReminder,
  } = useRecordScreen({ id, linkedTab });

  return {
    amazen,
    c,
    t,
    toast,
    wide,
    m,
    record,
    spaceName,
    reminderRequest,
    askReminder,
    menu,
    setMenu,
    openMore,
    back,
    refresher,
    feedItems,
    renderFeed,
    renderReminder,
  };
}
