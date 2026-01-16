import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAccessToken, getRefreshToken } from '../lib/api';
import { useAuth } from '../contexts/auth-context';

interface TokenInfo {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  accessTokenExp: Date | null;
  refreshTokenExp: Date | null;
  accessTokenTTL: number; // seconds until expiry
  refreshTokenTTL: number;
}

// Base64 decode for React Native (atob not available)
function base64Decode(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let output = '';

  if (str.length % 4 === 1) {
    return '';
  }

  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer);
    if (buffer === -1) continue;
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
  }

  return output;
}

function parseJwt(token: string): { exp?: number } | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      base64Decode(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function formatTTL(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function TokenMonitor() {
  const { logout } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo>({
    hasAccessToken: false,
    hasRefreshToken: false,
    accessTokenExp: null,
    refreshTokenExp: null,
    accessTokenTTL: 0,
    refreshTokenTTL: 0,
  });

  const updateTokenInfo = useCallback(async () => {
    const [accessToken, refreshToken] = await Promise.all([
      getAccessToken(),
      getRefreshToken(),
    ]);

    const now = Math.floor(Date.now() / 1000);
    let accessTokenExp: Date | null = null;
    let refreshTokenExp: Date | null = null;
    let accessTokenTTL = 0;
    let refreshTokenTTL = 0;

    if (accessToken) {
      const payload = parseJwt(accessToken);
      if (payload?.exp) {
        accessTokenExp = new Date(payload.exp * 1000);
        accessTokenTTL = Math.max(0, payload.exp - now);
      }
    }

    if (refreshToken) {
      const payload = parseJwt(refreshToken);
      if (payload?.exp) {
        refreshTokenExp = new Date(payload.exp * 1000);
        refreshTokenTTL = Math.max(0, payload.exp - now);
      }
    }

    setTokenInfo({
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      accessTokenExp,
      refreshTokenExp,
      accessTokenTTL,
      refreshTokenTTL,
    });
  }, []);

  useEffect(() => {
    updateTokenInfo();
    const interval = setInterval(updateTokenInfo, 1000);
    return () => clearInterval(interval);
  }, [updateTokenInfo]);

  const handleForceLogout = useCallback(() => {
    Alert.alert(
      'Force Logout',
      'This will clear all tokens and redirect to login. Use this if you see "Token already used" errors.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await logout();
            } catch (error) {
              console.log('[TokenMonitor] Force logout error:', error);
            }
            setIsLoggingOut(false);
          },
        },
      ]
    );
  }, [logout]);

  const getStatusColor = (ttl: number, hasToken: boolean) => {
    if (!hasToken) return '#94a3b8'; // gray
    if (ttl <= 0) return '#dc2626'; // red - expired
    if (ttl < 30) return '#f97316'; // orange - expiring soon
    if (ttl < 60) return '#eab308'; // yellow - warning
    return '#16a34a'; // green - healthy
  };

  const accessColor = getStatusColor(tokenInfo.accessTokenTTL, tokenInfo.hasAccessToken);
  const refreshColor = getStatusColor(tokenInfo.refreshTokenTTL, tokenInfo.hasRefreshToken);

  if (!isExpanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedContainer}
        onPress={() => setIsExpanded(true)}
        activeOpacity={0.8}
      >
        <View style={styles.collapsedContent}>
          <View style={[styles.statusDot, { backgroundColor: accessColor }]} />
          <Text style={styles.collapsedText}>
            {tokenInfo.hasAccessToken ? formatTTL(tokenInfo.accessTokenTTL) : 'No Token'}
          </Text>
          <Ionicons name="chevron-up" size={14} color="#64748b" />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(false)}
        activeOpacity={0.8}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="key-outline" size={16} color="#64748b" />
          <Text style={styles.headerText}>Token Monitor</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color="#64748b" />
      </TouchableOpacity>

      <View style={styles.tokenRow}>
        <View style={styles.tokenInfo}>
          <View style={styles.tokenHeader}>
            <View style={[styles.statusDot, { backgroundColor: accessColor }]} />
            <Text style={styles.tokenLabel}>Access Token</Text>
          </View>
          {tokenInfo.hasAccessToken ? (
            <>
              <Text style={[styles.ttlText, { color: accessColor }]}>
                {formatTTL(tokenInfo.accessTokenTTL)}
              </Text>
              <Text style={styles.expText}>
                Exp: {tokenInfo.accessTokenExp?.toLocaleTimeString()}
              </Text>
            </>
          ) : (
            <Text style={styles.noTokenText}>Not present</Text>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.tokenInfo}>
          <View style={styles.tokenHeader}>
            <View style={[styles.statusDot, { backgroundColor: refreshColor }]} />
            <Text style={styles.tokenLabel}>Refresh Token</Text>
          </View>
          {tokenInfo.hasRefreshToken ? (
            <>
              <Text style={[styles.ttlText, { color: refreshColor }]}>
                {formatTTL(tokenInfo.refreshTokenTTL)}
              </Text>
              <Text style={styles.expText}>
                Exp: {tokenInfo.refreshTokenExp?.toLocaleTimeString()}
              </Text>
            </>
          ) : (
            <Text style={styles.noTokenText}>Not present</Text>
          )}
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.refreshButton} onPress={updateTokenInfo}>
          <Ionicons name="refresh" size={14} color="#64748b" />
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleForceLogout}
          disabled={isLoggingOut}
        >
          <Ionicons name="log-out-outline" size={14} color="#dc2626" />
          <Text style={styles.logoutText}>
            {isLoggingOut ? 'Logging out...' : 'Force Logout'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedContainer: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 1000,
  },
  collapsedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  collapsedText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  container: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 16,
    padding: 12,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  tokenRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tokenInfo: {
    flex: 1,
  },
  tokenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tokenLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  ttlText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  expText: {
    color: '#64748b',
    fontSize: 10,
  },
  noTokenText: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  refreshText: {
    color: '#64748b',
    fontSize: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  logoutText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '500',
  },
});
