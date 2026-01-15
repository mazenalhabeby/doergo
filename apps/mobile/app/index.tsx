import { View, StyleSheet } from 'react-native';

// This screen is shown very briefly while auth state is being determined
// The animated splash covers most of the loading time
// Using a matching background color for seamless transition
export default function IndexScreen() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a', // Matches splash background for seamless transition
  },
});
