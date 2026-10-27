import { useLocalSearchParams } from 'expo-router';
import { ApprovalDetail } from '@/features/approvals/approval-detail';

/** One waiting decision, by `kind:id`. */
export default function ApprovalRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  // Keyed by the item: opening another one starts from a clean form (no time or date left from the last).
  const itemKey = String(key ?? '');
  return <ApprovalDetail key={itemKey} itemKey={itemKey} />;
}
