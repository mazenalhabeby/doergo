import { useProfileScreen } from './use-profile-screen';

/** ProfileScreen's state and handlers — everything before its markup (in use-profile-screen). */
export function useProfileScreenLogic() {
  return useProfileScreen();
}

/** What ProfileScreen and its sections read. */
export type ProfileScreenState = ReturnType<typeof useProfileScreenLogic>;
