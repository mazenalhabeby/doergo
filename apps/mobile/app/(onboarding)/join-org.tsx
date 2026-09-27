import { useLocalSearchParams } from 'expo-router';
import { PassScreen } from '../../src/components/onboarding/pass-screen';

/**
 * Kept as a route so links that already point here still open — it is the
 * same pass now: one field that recognises either kind of code.
 */
export default function Screen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <PassScreen initialCode={code} />;
}
