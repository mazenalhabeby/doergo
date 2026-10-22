import { useLocalSearchParams } from 'expo-router';
import { ApprovalDetail } from '@/features/approvals/approval-detail';

/** One waiting decision, by `kind:id`. */
export default function ApprovalRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <ApprovalDetail itemKey={String(key ?? '')} />;
}
