/**
 * One test per bug found in the review of the scan, review, meals and settings flows, so none of
 * them comes back. (The diet filter's are in diets.test.ts.)
 */
import { act, create } from 'react-test-renderer';
import { NotificationRouter } from '../src/components/NotificationRouter';
import { matchTracked } from '../src/lib/meals';
import { toDrafts, type DraftItem } from '../src/lib/scan';
import type { LearnedFood, ScanResponse } from '../src/lib/types';
import { useFoodLog } from '../src/store/foodLog';
import { setHealthForTesting, useHealth } from '../src/store/health';
import { addToLog, clearLog } from '../src/store/logActions';
import { useScanDraft } from '../src/store/scanDraft';
import type { ShoppingItem } from '../src/store/shopping';
import { mk } from '../test-utils/helpers';

jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
// The phone keeps the last tapped notification until the app clears it.
let mockLastTap: unknown = null;
const mockCleared = new Set<() => void>();
jest.mock('expo-notifications', () => {
  const { useEffect, useState } = jest.requireActual('react') as typeof import('react');
  return {
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    useLastNotificationResponse: () => {
      const [value, setValue] = useState(mockLastTap);
      useEffect(() => {
        const clear = () => setValue(null);
        mockCleared.add(clear);
        return () => void mockCleared.delete(clear);
      }, []);
      return value;
    },
    clearLastNotificationResponse: () => {
      mockLastTap = null;
      mockCleared.forEach((clear) => clear());
    },
  };
});

describe('"I made this" marks the right food as used', () => {
  it('picks the copy that goes off soonest, wherever it is in the list', () => {
    const items = [mk('new', 'Chicken thighs', '2026-10-10', { category: 'meat' }), mk('old', 'Chicken thighs', '2026-10-07', { category: 'meat' })];
    expect(matchTracked('Chicken thighs', items)?.id).toBe('old');
    expect(matchTracked('chicken', items)?.id).toBe('old');
  });

  it('matches whole words, plurals included, never part of another word', () => {
    const items = [mk('plant', 'Eggplant', '2026-10-08'), mk('eggs', 'Eggs', '2026-10-12'), mk('pine', 'Pineapple', '2026-10-05'), mk('spin', 'Spinach', '2026-10-06')];
    expect(matchTracked('Egg', items)?.id).toBe('eggs');
    expect(matchTracked('Apple', items)).toBeUndefined();
    expect(matchTracked('Baby spinach', items)?.id).toBe('spin');
    expect(matchTracked('Tomatoes', [mk('t', 'Cherry tomato', '2026-10-08')])?.id).toBe('t');
  });

  it('prefers the same name over a longer one that contains it', () => {
    const items = [mk('juice', 'Apple juice', '2026-10-02'), mk('apples', 'Apples', '2026-10-09')];
    expect(matchTracked('Apple', items)?.id).toBe('apples');
  });
});

describe('Delete all my data', () => {
  it('takes the logged meals back out of the health app before disconnecting it', async () => {
    const deleted: string[][] = [];
    let n = 0;
    setHealthForTesting({
      kind: 'apple',
      name: 'Apple Health',
      isAvailable: async () => true,
      requestAccess: async () => true,
      readDays: async () => [],
      writeNutrition: async () => [`hk-${++n}`],
      deleteNutrition: async (ids: string[]) => {
        deleted.push(ids);
      },
    } as unknown as Parameters<typeof setHealthForTesting>[0]);
    act(() => {
      useHealth.setState({ connected: true, writeFood: true });
    });
    act(() => {
      addToLog({ title: 'Omelette', kind: 'meal', portion: '1 serving', servings: 1, perServing: { kcal: 300, protein: 20, carbs: 2, fat: 22 } });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(useFoodLog.getState().entries[0]?.healthIds).toEqual(['hk-1']);
    act(() => {
      clearLog();
    });
    expect(useFoodLog.getState().entries).toEqual([]);
    expect(deleted).toEqual([['hk-1']]);
  });
});

const food = (over: Partial<LearnedFood> = {}): LearnedFood => ({
  id: 'f1', name: 'Gochujang', brand: null, product: null, category: 'condiments', keptIn: 'pantry', shelfLife: { fridge: 730, freezer: null, pantry: 365 },
  looks: '', aliases: [], imageUrl: null, imageCredit: null, sourceUrl: null, addedOn: '2026-10-06', ...over,
});
const shop = (id: string, name: string, over: Partial<ShoppingItem> = {}): ShoppingItem => ({ id, name, category: 'other', checked: true, addedOn: '2026-10-06', ...over });
const place = (name: string) => useScanDraft.getState().drafts.find((d: DraftItem) => d.name === name)?.location;

describe('places on the review list', () => {
  beforeEach(() => act(() => useScanDraft.getState().clear()));

  it('moving the list there and back leaves food that lives elsewhere where it was', () => {
    act(() => {
      useScanDraft.getState().startPutAway([shop('1', 'Milk', { category: 'dairy' }), shop('2', 'Bananas', { category: 'produce' }), shop('3', 'Ice cream', { category: 'dairy', keptIn: 'freezer' })]);
    });
    const iceBefore = useScanDraft.getState().drafts.find((d) => d.name === 'Ice cream')!;
    const before = { bananas: place('Bananas'), ice: iceBefore.location };
    expect(before.ice).toBe('freezer');
    for (const to of ['freezer', 'fridge', 'pantry', 'fridge'] as const) {
      act(() => {
        useScanDraft.getState().setLocation(to);
      });
    }
    expect(place('Ice cream')).toBe('freezer');
    expect(place('Bananas')).toBe(before.bananas);
    expect(place('Milk')).toBe('fridge');
    expect(useScanDraft.getState().drafts.find((d) => d.name === 'Ice cream')?.expiresOn).toBe(iceBefore.expiresOn);
  });

  it('one the person moved stays with them when the list moves', () => {
    act(() => {
      useScanDraft.getState().startPutAway([shop('1', 'Milk', { category: 'dairy' }), shop('2', 'Butter', { category: 'dairy' })]);
    });
    const butter = useScanDraft.getState().drafts.find((d) => d.name === 'Butter')!.key;
    act(() => {
      useScanDraft.getState().moveDraft(butter, 'freezer');
      useScanDraft.getState().setLocation('freezer');
      useScanDraft.getState().setLocation('fridge');
    });
    expect(place('Milk')).toBe('fridge');
    expect(place('Butter')).toBe('freezer');
  });

  it('on a receipt, a confirmed lookup keeps the place the person picked, and fills in one they did not', () => {
    const res: ScanResponse = {
      items: [
        { name: 'Chung jung one paste', category: 'condiments', quantity: '1', shelfLifeDays: null, labelExpiryDate: null, confidence: 'medium', keptIn: 'pantry' },
        { name: 'Mystery sauce', category: 'condiments', quantity: '1', shelfLifeDays: null, labelExpiryDate: null, confidence: 'medium', keptIn: 'pantry' },
      ],
      notes: null,
      purchaseDate: null,
      currency: null,
    } as ScanResponse;
    const drafts = toDrafts(res, 'fridge', [], new Date(), 'receipt');
    act(() => {
      useScanDraft.getState().start('fridge', drafts, null, 'receipt');
    });
    const [picked, left] = useScanDraft.getState().drafts.map((d) => d.key) as [string, string];
    act(() => {
      useScanDraft.getState().moveDraft(picked, 'fridge');
      useScanDraft.getState().applyIdentified(picked, food({ keptIn: 'pantry' }));
      useScanDraft.getState().applyIdentified(left, food({ id: 'f2', name: 'Doenjang', keptIn: 'fridge' }));
    });
    expect(useScanDraft.getState().drafts.find((d) => d.key === picked)?.location).toBe('fridge');
    expect(useScanDraft.getState().drafts.find((d) => d.key === left)?.location).toBe('fridge');
  });
});

describe('a tapped reminder', () => {
  it('opens its screen once, not again when access comes back later', () => {
    mockLastTap = { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { request: { identifier: 'trial-1', content: { data: { route: '/settings' } } } } };
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<NotificationRouter />);
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
    // The plan lapses (the paywall replaces the app), then the person subscribes again.
    act(() => tree.update(<></>));
    act(() => tree.update(<NotificationRouter />));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });
});
