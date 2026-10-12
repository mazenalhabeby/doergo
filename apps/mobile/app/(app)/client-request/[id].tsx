import { useLocalSearchParams } from 'expo-router';
import { RequestDetail } from '../../../src/components/client-requests/request-detail';

/** One client request — the screen lives in `src/components/client-requests/`. */
export default function ClientRequestRoute() {
  const p = useLocalSearchParams<{ id: string; portalId: string; spaceId: string }>();
  return <RequestDetail key={p.id} id={p.id} portalId={p.portalId} spaceId={p.spaceId} />;
}
