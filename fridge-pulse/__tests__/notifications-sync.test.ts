import { Platform } from 'react-native';
import { syncReminders } from '../src/lib/notifications';
import type { PantryItem } from '../src/lib/types';

// A fake scheduler whose calls resolve on later ticks, so overlapping syncs can interleave.
const mockScheduled: { title: string }[] = [];
const mockTick = () => new Promise((r) => setTimeout(r, 0));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => {
    await mockTick();
    return { granted: true };
  }),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {
    await mockTick();
    mockScheduled.length = 0;
  }),
  scheduleNotificationAsync: jest.fn(async ({ content }: { content: { title: string } }) => {
    await mockTick();
    mockScheduled.push({ title: content.title });
  }),
  setNotificationChannelAsync: jest.fn(async () => {}),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));


const item = (id: string, expiresOn: string): PantryItem => ({
  id,
  name: `Food ${id}`,
  category: 'other',
  quantity: '1',
  location: 'fridge',
  addedOn: '2026-09-01',
  expiresOn,
  expirySource: 'estimate',
  status: 'active',
});

describe('syncReminders', () => {
  beforeAll(() => {
    Platform.OS = 'ios';
  });

  it('leaves only the newest set of reminders when changes come quickly', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const iso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
    const items = [item('a', iso)];
    // Three quick changes of reminder hour, as when tapping + three times.
    const runs = [9, 10, 11].map((hour) => syncReminders(items, { enabled: true, hour }));
    await Promise.all(runs);
    // One item expiring in 3 days gets two digests (the day before and the day itself), once.
    expect(mockScheduled).toHaveLength(2);
  });
});
