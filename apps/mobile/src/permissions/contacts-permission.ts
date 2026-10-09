import { createPermissionHook, type PermissionResponse } from 'expo-modules-core';
import { expoContacts } from '../lib/optional-native';

/**
 * The address-book permission, as a hook — the same tuple shape as every other
 * expo permission, so `useAccess` gives it the same three states and the same
 * re-read on focus and on return from Settings.
 *
 * Here, in permissions/, because "can we ask again" is decided in ONE folder
 * (`media-access.spec.ts`). On a build without the module it answers a final
 * no: nothing to ask, nothing to open in Settings — the screen says to update.
 */
export type ContactsPermission = PermissionResponse & { accessPrivileges?: 'all' | 'limited' | 'none' };

const unavailable: ContactsPermission = {
  status: 'denied' as PermissionResponse['status'],
  granted: false,
  canAskAgain: false,
  expires: 'never',
};

export const useContactsPermission = createPermissionHook<ContactsPermission, object>({
  getMethod: async () => (await expoContacts()?.getPermissionsAsync()) ?? unavailable,
  requestMethod: async () => (await expoContacts()?.requestPermissionsAsync()) ?? unavailable,
});
