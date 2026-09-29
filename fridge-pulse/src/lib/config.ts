import { Platform } from 'react-native';

/**
 * Set only when capturing store screenshots (EXPO_PUBLIC_SCREENSHOT_MODE=1): hides the notes that
 * explain preview / demo behaviour, so promotional images show the app as customers will see it.
 */
export const SCREENSHOT_MODE = process.env.EXPO_PUBLIC_SCREENSHOT_MODE === '1';

/** Public web addresses for the policies. Required by the stores; the app also bundles the text. */
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL || '';
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || '';

/** Shown in the policies and the About screen. */
export const DEVELOPER_NAME = process.env.EXPO_PUBLIC_DEVELOPER_NAME || 'the Fridge Pulse team';
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || '';

export const MANAGE_SUBSCRIPTION_URL =
  Platform.OS === 'android'
    ? 'https://play.google.com/store/account/subscriptions'
    : 'https://apps.apple.com/account/subscriptions';
