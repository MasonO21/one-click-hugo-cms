/**
 * One test per bug found in the review of the item screen, the lists, the food log screen and
 * saved data, so none of them comes back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer';
import { create as createStore } from 'zustand';
import { persist } from 'zustand/middleware';
import Inventory from '../src/app/(tabs)/inventory';
import Item from '../src/app/item/[id]';
import FoodLog from '../src/app/log';
import { addDays, todayISO } from '../src/lib/dates';
import { LOG_HISTORY_DAYS } from '../src/lib/foodLog';
import { parseNumber } from '../src/lib/goals';
import { usualPlace } from '../src/lib/shelfLife';
import type { PantryItem } from '../src/lib/types';
import { useFoodLog } from '../src/store/foodLog';
import { useInventory } from '../src/store/inventory';
import { addToLog } from '../src/store/logActions';
import { useShopping } from '../src/store/shopping';
import { persistStorage } from '../src/store/storage';

let mockId = '';
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useSegments: () => ['item'],
  useLocalSearchParams: () => ({ id: mockId }),
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const today = todayISO();
const item = (id: string, name: string, over: Partial<PantryItem> = {}): PantryItem => ({
  id, name, category: 'other', quantity: '1', location: 'fridge', addedOn: today, expiresOn: addDays(today, 5), expirySource: 'estimate', status: 'active', ...over,
});

/** Screens still mounted; unmounted after each test even when it fails, so a failure cannot hang the run. */
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

async function render(screen: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<SafeAreaProvider initialMetrics={metrics}>{screen}</SafeAreaProvider>);
  });
  mounted.push(tree);
  const byId = (id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && (n.props.onPress || n.props.onChangeText || n.props.onBlur))[0]!;
  return { tree, byId };
}

/** All visible text, joined up. */
function textOf(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children ?? []).map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}

describe('saved data that cannot be read', () => {
  const flush = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
  };

  it('is set aside and the store starts afresh, instead of the app never loading', async () => {
    await AsyncStorage.setItem('test.damaged', '{"state":{"items":[{"id":"a"');
    const store = createStore(persist(() => ({ items: [] as unknown[] }), { name: 'test.damaged', version: 1, storage: persistStorage() }));
    await flush();
    expect(store.persist.hasHydrated()).toBe(true);
    expect(store.getState().items).toEqual([]);
    expect(await AsyncStorage.getItem('test.damaged.unreadable')).toBe('{"state":{"items":[{"id":"a"');
  });

  it('readable data still loads as before', async () => {
    await AsyncStorage.setItem('test.fine', JSON.stringify({ state: { items: ['a'] }, version: 1 }));
    const store = createStore(persist(() => ({ items: [] as unknown[] }), { name: 'test.fine', version: 1, storage: persistStorage() }));
    await flush();
    expect(store.persist.hasHydrated()).toBe(true);
    expect(store.getState().items).toEqual(['a']);
  });

  it('an older inventory with a damaged entry still loads, without that entry', async () => {
    await AsyncStorage.setItem('fp.inventory.v1', JSON.stringify({ state: { items: [null, 7, item('ok', 'Milk', { status: 'used', resolvedOn: today })] }, version: 1 }));
    await act(async () => {
      await useInventory.persist.rehydrate();
    });
    expect(useInventory.persist.hasHydrated()).toBe(true);
    expect(useInventory.getState().items.map((i) => i.id)).toEqual(['ok']);
    act(() => {
      useInventory.getState().clear();
    });
  });
});

describe('the food log screen', () => {
  afterEach(() => {
    jest.useRealTimers();
    act(() => {
      useFoodLog.getState().clear();
    });
  });

  it('goes back as far as the log keeps, and no further', async () => {
    const { byId } = await render(<FoodLog />);
    for (let i = 0; i < LOG_HISTORY_DAYS + 5; i += 1) {
      await act(async () => {
        byId('log-prev-day').props.onPress();
      });
    }
    expect(byId('log-prev-day').props.disabled).toBe(true);
    await act(async () => {
      byId('quick-open').props.onPress();
    });
    await act(async () => {
      byId('quick-kcal').props.onChangeText('300');
    });
    await act(async () => {
      byId('quick-save').props.onPress();
    });
    expect(useFoodLog.getState().entries.map((e) => e.day)).toEqual([addDays(today, -LOG_HISTORY_DAYS)]);
  });

  it('adding to a day the log no longer keeps is ignored, not a crash', () => {
    expect(addToLog({ title: 'Toast', kind: 'quick', portion: '1 serving', servings: 1, perServing: { kcal: 100, protein: 5, carbs: 10, fat: 2 }, day: addDays(today, -LOG_HISTORY_DAYS - 1) })).toBeUndefined();
    expect(useFoodLog.getState().entries).toEqual([]);
  });

  it('left open over midnight, moves on to the new day', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 6, 23, 50, 0) });
    const { tree, byId } = await render(<FoodLog />);
    const label = () => textOf(tree.root.findByProps({ testID: 'log-day' }).children as unknown as ReactTestRendererJSON[]);
    expect(label()).toBe('Today');
    await act(async () => {
      jest.advanceTimersByTime(20 * 60 * 1000);
    });
    expect(label()).toBe('Today');
    await act(async () => {
      byId('quick-open').props.onPress();
    });
    await act(async () => {
      byId('quick-kcal').props.onChangeText('400');
    });
    await act(async () => {
      byId('quick-save').props.onPress();
    });
    expect(useFoodLog.getState().entries.map((e) => e.day)).toEqual(['2026-10-07']);
  });
});

describe('the item screen', () => {
  beforeEach(() =>
    act(() => {
      useInventory.getState().clear();
      useShopping.getState().clear();
    }),
  );

  it('reads prices people type, and keeps the old one when it cannot', async () => {
    expect(parseNumber('.99')).toBe(0.99);
    expect(parseNumber('3.')).toBe(3);
    expect(parseNumber('.')).toBeNull();
    act(() => {
      useInventory.getState().addItems([item('p', 'Hummus', { price: 3.49, currency: 'USD' })]);
    });
    mockId = 'p';
    const { byId } = await render(<Item />);
    const price = () => useInventory.getState().items.find((i) => i.id === 'p')?.price;
    const type = async (text: string) => {
      await act(async () => {
        byId('item-price').props.onFocus?.();
        byId('item-price').props.onChangeText(text);
      });
      await act(async () => {
        byId('item-price').props.onBlur();
      });
    };
    await type('.99');
    expect(price()).toBe(0.99);
    await type('$3.49');
    expect(price()).toBe(3.49);
    await type('cheap');
    expect(price()).toBe(3.49);
    expect(byId('item-price').props.value).toBe('3.49');
    await type('');
    expect(price()).toBeUndefined();
  });

  it('a housemate’s change does not overwrite what is being typed', async () => {
    act(() => {
      useInventory.getState().addItems([item('m', 'Milk', { category: 'dairy' })]);
    });
    mockId = 'm';
    const { byId } = await render(<Item />);
    await act(async () => {
      byId('item-name').props.onFocus?.();
      byId('item-name').props.onChangeText('Oat milk barista');
    });
    await act(async () => {
      useInventory.getState().updateItem('m', { name: 'Milk 2L' });
    });
    expect(byId('item-name').props.value).toBe('Oat milk barista');
    await act(async () => {
      byId('item-name').props.onBlur();
    });
    expect(useInventory.getState().items.find((i) => i.id === 'm')?.name).toBe('Oat milk barista');
    // Not editing: an outside rename shows straight away.
    await act(async () => {
      useInventory.getState().updateItem('m', { name: 'Whole milk' });
    });
    expect(byId('item-name').props.value).toBe('Whole milk');
  });

  it('"Add to shopping list" keeps where the food goes, as typing it on the list does', async () => {
    expect(usualPlace('Veggie burgers', 'other')).toBe('freezer');
    act(() => {
      useInventory.getState().addItems([item('vb', 'Veggie burgers', { location: 'freezer', expiresOn: addDays(today, 60) })]);
    });
    mockId = 'vb';
    const { byId } = await render(<Item />);
    await act(async () => {
      byId('add-to-list').props.onPress();
    });
    expect(useShopping.getState().items[0]).toMatchObject({ name: 'Veggie burgers', keptIn: 'freezer' });
  });
});

describe('searching your items', () => {
  it('ignores accents, as adding food does', async () => {
    act(() => {
      useInventory.getState().clear();
      useInventory.getState().addItems([item('cf', 'Crème fraîche', { category: 'dairy' }), item('m', 'Milk', { category: 'dairy' })]);
    });
    const { tree, byId } = await render(<Inventory />);
    await act(async () => {
      byId('search').props.onChangeText('creme');
    });
    const text = textOf(tree.toJSON() as ReactTestRendererJSON);
    expect(text).toContain('Crème fraîche');
    expect(text).not.toContain('Milk');
  });
});
