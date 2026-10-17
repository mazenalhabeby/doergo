import React from 'react';
import { RefreshControl } from 'react-native';

/*
  Functions returning the element, not components: ScrollView / FlatList clone the element they are
  given in `refreshControl`, so it must be a RefreshControl itself.
*/

/** Pull to refresh in the accent colour, running `onRefresh`. */
export function refreshControl({
  refreshing,
  onRefresh,
  color,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  color: string;
}) {
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color} colors={[color]} />;
}

/** Pull to refresh that shows the spinner for as long as `load()` runs. */
export function pullRefresh({
  refreshing,
  setRefreshing,
  load,
  color,
}: {
  refreshing: boolean;
  setRefreshing: (on: boolean) => void;
  load: () => Promise<unknown>;
  color: string;
}) {
  return refreshControl({
    refreshing,
    onRefresh: async () => {
      setRefreshing(true);
      await load();
      setRefreshing(false);
    },
    color,
  });
}
