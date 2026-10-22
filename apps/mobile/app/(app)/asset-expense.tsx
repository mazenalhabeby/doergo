import { useLocalSearchParams } from 'expo-router';

import { EquipmentPicker } from '@/features/equipment/equipment-picker';
import { AssetExpenseScreen } from '@/features/equipment/asset-expense-screen';

/**
 * File what I just spent, at the pump, in about fifteen seconds.
 *
 * Three states in one screen — choose, photograph, check — because the last is
 * a REVIEW of the one before it and "back" has to return to the camera, not to
 * the list. The same reason the card scanner is one route.
 *
 * ⚠️ Nothing is sent without the person seeing it. What the reader could PROVE
 * (a figure on a line that says "Total") is marked read; what it GUESSED (the
 * biggest number it could find) is marked as needing a look. A receipt has no
 * check digit, and an OCR reading 8 as 3 is not a rare event — the amount is
 * money, and it is the number nobody re-reads once it looks plausible.
 *
 * ⚠️ And the photograph is deleted the moment it has been uploaded or has
 * failed. It is a picture of somebody's card slip; leaving it in a cache
 * directory with no expiry undoes the point of reading it on the device.
 */

/**
 * Opened from a home shortcut there is no equipment in the link: ask which one
 * first (or go straight to the only one) instead of "You do not have this one".
 */
export default function AssetExpenseScreenRoute() {
  const { assetId } = useLocalSearchParams<{ assetId?: string }>();
  return assetId ? <AssetExpenseScreen /> : <EquipmentPicker what="expense" />;
}
