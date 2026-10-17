import { useNewEventScreen } from './use-new-event-screen';

/** NewEventScreen's state and handlers — everything before its markup (in use-new-event-screen). */
export function useNewEventScreenLogic() {
  return useNewEventScreen();
}

/** What NewEventScreen and its sections read. */
export type NewEventScreenState = ReturnType<typeof useNewEventScreenLogic>;
