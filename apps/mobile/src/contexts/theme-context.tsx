import { createContext, useContext, useMemo, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getThemeColors, type ThemeColors } from '../lib/constants';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = '@hbcfield/theme-mode';

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Load persisted preference on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
      }
    });
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const effectiveScheme = mode === 'system' ? systemScheme : mode;
    return {
      colors: getThemeColors(effectiveScheme),
      isDark: effectiveScheme === 'dark',
      mode,
      setMode,
    };
  }, [systemScheme, mode, setMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
