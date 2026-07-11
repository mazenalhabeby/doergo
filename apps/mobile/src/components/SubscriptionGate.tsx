import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { billingApi } from '../lib/api/billing';
import { isLocked } from '@hbcfield/shared/client';
import type { SubStatus } from '@hbcfield/shared/client';

/**
 * Full-screen block shown when the organization's subscription is inactive
 * (trial ended unpaid or canceled). Data is preserved; the field team simply
 * can't work until an admin reactivates on the web.
 *
 * IMPORTANT: no purchase/pricing UI here (Apple/Google IAP rules) — the message
 * only points the user to their admin. Renders null when the sub is healthy.
 */
export function SubscriptionGate() {
  const { t } = useTranslation();
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const s = await billingApi.getStatus();
      const isLockedNow = !!s?.locked || (s?.status ? isLocked(s.status as SubStatus) : false);
      setLocked(isLockedNow);
    } catch {
      // Never lock the app on a transient fetch error.
      setLocked(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (!locked) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.icon}>
        <Ionicons name="lock-closed" size={34} color="#f87171" />
      </View>
      <Text style={styles.title}>{t('billing.locked.title', 'Subscription inactive')}</Text>
      <Text style={styles.body}>
        {t(
          'billing.locked.body',
          "Your organization's HBCField subscription is inactive. Please ask your administrator to reactivate it to continue.",
        )}
      </Text>
      <Pressable style={styles.button} onPress={check} disabled={checking}>
        {checking ? (
          <ActivityIndicator color="#0e1116" />
        ) : (
          <Text style={styles.buttonText}>{t('common.retry', 'Try again')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0e1116',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 1000,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(248,113,113,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { color: '#f2f2f0', fontSize: 20, fontWeight: '600', marginBottom: 10, textAlign: 'center' },
  body: { color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 28 },
  button: {
    backgroundColor: '#efefec',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    minWidth: 140,
    alignItems: 'center',
  },
  buttonText: { color: '#0e1116', fontSize: 14, fontWeight: '600' },
});
