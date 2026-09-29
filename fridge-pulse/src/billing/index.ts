import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { createLocalProvider } from './local';
import { createRevenueCatProvider } from './revenuecat';
import { createUnconfiguredProvider } from './unconfigured';
import type { BillingProvider } from './types';

export type { BillingProvider, Offer, PurchaseResult } from './types';

const REVENUECAT_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

/**
 * - Real store billing when a RevenueCat key is set (dev build or production).
 * - Local trial simulation in development, Expo Go, or when EXPO_PUBLIC_BILLING_MODE=demo.
 * - Otherwise fail closed: a production build without keys must not hand out access.
 */
export function pickProvider(): BillingProvider {
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (REVENUECAT_KEY && !inExpoGo) {
    const rc = createRevenueCatProvider(REVENUECAT_KEY);
    if (rc) return rc;
  }
  if (__DEV__ || process.env.EXPO_PUBLIC_BILLING_MODE === 'demo') return createLocalProvider();
  return createUnconfiguredProvider();
}
