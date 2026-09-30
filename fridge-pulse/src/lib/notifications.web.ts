import type { PantryItem } from './types';

// Browsers get no local notifications, and importing expo-notifications on web registers a push-token
// listener that only logs a warning. This file stands in for notifications.ts there.

export function configureNotifications(): void {}

export async function hasPermission(): Promise<boolean> {
  return false;
}

export async function requestPermission(): Promise<boolean> {
  return false;
}

export function syncReminders(_items: PantryItem[], _options: { enabled: boolean; hour: number; trial?: { endsOn: string; price: string } | null }): Promise<void> {
  return Promise.resolve();
}
