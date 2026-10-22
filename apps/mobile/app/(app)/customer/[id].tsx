import { useLocalSearchParams } from 'expo-router';
import { RecordScreen } from '@/features/customer/record/record-screen';

/**
 * The client record — the screen lives in `src/components/customer/record/`;
 * this route only reads the link. `?tab=reminders` (a reminder's push) picks
 * the FIRST tab rather than switching to it after the fact.
 */
export default function CustomerRecordRoute() {
  const params = useLocalSearchParams<{ id: string; tab?: string | string[] }>();
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  return <RecordScreen key={params.id} id={params.id} linkedTab={tab} />;
}
