/**
 * Skeleton loading components — shimmer effect for premium loading UX
 * Usage: <Skeleton.Line />, <Skeleton.Circle />, <Skeleton.Card />
 */
import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/theme-context';
import { SPACING, RADIUS } from '../lib/constants';

// Shared shimmer animation
function useShimmer() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim;
}

interface SkeletonBaseProps {
  style?: ViewStyle;
}

function ShimmerBox({ style }: SkeletonBaseProps) {
  const { colors, isDark } = useTheme();
  const anim = useShimmer();
  const bg = isDark ? '#1e1e30' : '#e2e8f0';
  const highlight = isDark ? '#2a2a40' : '#f1f5f9';

  return (
    <Animated.View
      style={[
        { backgroundColor: bg, overflow: 'hidden' },
        style,
        {
          opacity: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.5],
          }),
        },
      ]}
    />
  );
}

// Line skeleton (text placeholder)
function Line({ width = '100%', height = 14, style }: { width?: number | string; height?: number; style?: ViewStyle }) {
  return <ShimmerBox style={[{ width: width as any, height, borderRadius: height / 2 }, style]} />;
}

// Circle skeleton (avatar placeholder)
function Circle({ size = 40, style }: { size?: number; style?: ViewStyle }) {
  return <ShimmerBox style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
}

// Rounded square skeleton (icon placeholder)
function Square({ size = 44, radius = 14, style }: { size?: number; radius?: number; style?: ViewStyle }) {
  return <ShimmerBox style={[{ width: size, height: size, borderRadius: radius }, style]} />;
}

// Card skeleton
function Card({ height = 80, style }: { height?: number; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[sStyles.card, { backgroundColor: colors.card, height }, style]}>
      <View style={sStyles.cardRow}>
        <Circle size={40} />
        <View style={sStyles.cardLines}>
          <Line width="60%" height={14} />
          <Line width="40%" height={10} style={{ marginTop: 8 }} />
        </View>
      </View>
    </View>
  );
}

// Task card skeleton
function TaskCard({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[sStyles.taskCard, { backgroundColor: colors.card }, style]}>
      <View style={sStyles.taskTop}>
        <Line width="70%" height={16} />
        <Square size={24} radius={6} />
      </View>
      <Line width="90%" height={12} style={{ marginTop: 10 }} />
      <View style={sStyles.taskBottom}>
        <Line width={80} height={10} />
        <Line width={60} height={10} />
      </View>
    </View>
  );
}

// Stats row skeleton
function StatsRow() {
  const { colors } = useTheme();
  return (
    <View style={[sStyles.statsCard, { backgroundColor: colors.card }]}>
      {[1, 2, 3, 4].map(i => (
        <View key={i} style={sStyles.statCell}>
          <Line width={30} height={22} />
          <Line width={40} height={10} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

// Calendar week skeleton
function WeekCalendar() {
  return (
    <View style={sStyles.calSection}>
      <View style={sStyles.calHeader}>
        <Line width={120} height={16} />
        <Line width={60} height={24} />
      </View>
      <View style={sStyles.calWeek}>
        {[1, 2, 3, 4, 5, 6, 7].map(i => (
          <View key={i} style={sStyles.calDay}>
            <Line width={20} height={10} />
            <Line width={20} height={18} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

// Full dashboard skeleton
function Dashboard() {
  return (
    <View style={sStyles.dashContainer}>
      <View style={sStyles.welcomeRow}>
        <View>
          <Line width={120} height={12} />
          <Line width={80} height={20} style={{ marginTop: 6 }} />
        </View>
      </View>
      <StatsRow />
      <WeekCalendar />
      <View style={{ marginTop: SPACING.xl, paddingHorizontal: SPACING.lg }}>
        <Line width={120} height={16} />
      </View>
      <View style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md, gap: SPACING.md }}>
        <TaskCard />
        <TaskCard />
      </View>
    </View>
  );
}

// List screen skeleton (for manage screens)
function ListScreen({ rows = 4 }: { rows?: number }) {
  return (
    <View style={sStyles.listContainer}>
      <View style={sStyles.filterRow}>
        {[1, 2, 3].map(i => <Line key={i} width={60} height={28} style={{ borderRadius: 14 }} />)}
      </View>
      <View style={sStyles.listCards}>
        {Array.from({ length: rows }).map((_, i) => <Card key={i} />)}
      </View>
    </View>
  );
}

// Tasks list skeleton
function TasksList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={sStyles.listContainer}>
      <View style={sStyles.filterRow}>
        {[1, 2, 3, 4].map(i => <Line key={i} width={55} height={28} style={{ borderRadius: 14 }} />)}
      </View>
      <View style={sStyles.listCards}>
        {Array.from({ length: rows }).map((_, i) => <TaskCard key={i} />)}
      </View>
    </View>
  );
}

export const Skeleton = {
  Line,
  Circle,
  Square,
  Card,
  TaskCard,
  StatsRow,
  WeekCalendar,
  Dashboard,
  ListScreen,
  TasksList,
};

const sStyles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  cardLines: {
    flex: 1,
  },
  taskCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  taskTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  calSection: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  calWeek: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  calDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  dashContainer: {
    flex: 1,
    paddingTop: SPACING.lg,
  },
  welcomeRow: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  listContainer: {
    flex: 1,
    paddingTop: SPACING.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  listCards: {
    paddingHorizontal: SPACING.lg,
  },
});
