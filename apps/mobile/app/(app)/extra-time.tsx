import { Redirect, type Href } from 'expo-router';

/** Decided in Approvals now — the one place every decision is made. Kept so old links and notifications still land. */
export default function ExtraTimeRoute() {
  return <Redirect href={'/(app)/approvals?kind=extraTime' as Href} />;
}
