import { Platform } from 'react-native';

export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL || 'https://example.com/terms';
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://example.com/privacy';

export const MANAGE_SUBSCRIPTION_URL =
  Platform.OS === 'android'
    ? 'https://play.google.com/store/account/subscriptions'
    : 'https://apps.apple.com/account/subscriptions';
