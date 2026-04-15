import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastConfig {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 3000
}

interface ToastContextValue {
  showToast: (config: ToastConfig) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

// ---------------------------------------------------------------------------
// Theme config per toast type
// ---------------------------------------------------------------------------

const TOAST_THEME: Record<ToastType, {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  bgDark: string;
  border: string;
  borderDark: string;
  iconColor: string;
  titleColor: string;
  titleColorDark: string;
  messageColor: string;
  messageColorDark: string;
}> = {
  success: {
    icon: 'checkmark-circle',
    bg: '#ECFDF5',
    bgDark: 'rgba(6, 78, 59, 0.85)',
    border: '#A7F3D0',
    borderDark: 'rgba(16, 185, 129, 0.3)',
    iconColor: '#059669',
    titleColor: '#065F46',
    titleColorDark: '#A7F3D0',
    messageColor: '#047857',
    messageColorDark: '#6EE7B7',
  },
  error: {
    icon: 'close-circle',
    bg: '#FEF2F2',
    bgDark: 'rgba(127, 29, 29, 0.85)',
    border: '#FECACA',
    borderDark: 'rgba(239, 68, 68, 0.3)',
    iconColor: '#EF4444',
    titleColor: '#991B1B',
    titleColorDark: '#FCA5A5',
    messageColor: '#B91C1C',
    messageColorDark: '#FCA5A5',
  },
  warning: {
    icon: 'warning',
    bg: '#FFFBEB',
    bgDark: 'rgba(120, 53, 15, 0.85)',
    border: '#FDE68A',
    borderDark: 'rgba(245, 158, 11, 0.3)',
    iconColor: '#F59E0B',
    titleColor: '#92400E',
    titleColorDark: '#FDE68A',
    messageColor: '#B45309',
    messageColorDark: '#FCD34D',
  },
  info: {
    icon: 'information-circle',
    bg: '#EFF6FF',
    bgDark: 'rgba(30, 58, 138, 0.85)',
    border: '#BFDBFE',
    borderDark: 'rgba(59, 130, 246, 0.3)',
    iconColor: '#3B82F6',
    titleColor: '#1E40AF',
    titleColorDark: '#BFDBFE',
    messageColor: '#1D4ED8',
    messageColorDark: '#93C5FD',
  },
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Single Toast Component
// ---------------------------------------------------------------------------

function Toast({
  config,
  onDismiss,
  isDark,
}: {
  config: ToastConfig;
  onDismiss: () => void;
  isDark: boolean;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = TOAST_THEME[config.type];
  const duration = config.duration ?? 3000;

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto dismiss
    timerRef.current = setTimeout(dismiss, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss());
  }, [onDismiss, translateY, opacity]);

  const bg = isDark ? theme.bgDark : theme.bg;
  const border = isDark ? theme.borderDark : theme.border;
  const titleColor = isDark ? theme.titleColorDark : theme.titleColor;
  const messageColor = isDark ? theme.messageColorDark : theme.messageColor;

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          top: insets.top + 8,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={dismiss}
        style={[
          styles.toast,
          {
            backgroundColor: bg,
            borderColor: border,
          },
        ]}
      >
        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}>
          <Ionicons name={theme.icon} size={22} color={theme.iconColor} />
        </View>

        {/* Text */}
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
            {config.title}
          </Text>
          {config.message ? (
            <Text style={[styles.message, { color: messageColor }]} numberOfLines={2}>
              {config.message}
            </Text>
          ) : null}
        </View>

        {/* Dismiss */}
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons
            name="close"
            size={18}
            color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)'}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({
  children,
  isDark = false,
}: {
  children: React.ReactNode;
  isDark?: boolean;
}) {
  const [toast, setToast] = useState<(ToastConfig & { id: number }) | null>(null);
  const idRef = useRef(0);

  const showToast = useCallback((config: ToastConfig) => {
    idRef.current += 1;
    setToast({ ...config, id: idRef.current });
  }, []);

  const success = useCallback((title: string, message?: string) => {
    showToast({ type: 'success', title, message });
  }, [showToast]);

  const error = useCallback((title: string, message?: string) => {
    showToast({ type: 'error', title, message, duration: 4000 });
  }, [showToast]);

  const warning = useCallback((title: string, message?: string) => {
    showToast({ type: 'warning', title, message });
  }, [showToast]);

  const info = useCallback((title: string, message?: string) => {
    showToast({ type: 'info', title, message });
  }, [showToast]);

  const handleDismiss = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      {toast && (
        <Toast
          key={toast.id}
          config={toast}
          onDismiss={handleDismiss}
          isDark={isDark}
        />
      )}
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99999,
    elevation: 99999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    // Shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    opacity: 0.85,
  },
});
