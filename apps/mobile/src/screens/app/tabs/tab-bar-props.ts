/** What the tab bar reads of the navigator's props (a structural subset of React Navigation's BottomTabBarProps). */
interface TabBarRoute {
  key: string;
  name: string;
}
export interface TabBarProps {
  state: { routes: TabBarRoute[]; index: number };
  descriptors: Record<string, { options: { title?: string; tabBarHidden?: boolean } }>;
  navigation: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}
