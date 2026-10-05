/**
 * Shared households: merging lists from other phones, and the sync loop against a stand-in server
 * that behaves like server/src/household.ts (newest change wins, numbered changes, deletions kept).
 */
import { act } from 'react-test-renderer';
import type { HouseholdView, SyncRecord } from '../src/lib/api';
import { itemData, itemFrom, merge, nextStamp, outgoing, pruneTombstones, shoppingFrom, TOMBSTONE_MS } from '../src/lib/householdSync';
import type { PantryItem } from '../src/lib/types';
import { isCovered, useHousehold } from '../src/store/household';
import { useInventory } from '../src/store/inventory';
import { useShopping } from '../src/store/shopping';
import { mk } from '../test-utils/helpers';

/** The stand-in server: one household, shared by "this phone" and a housemate. */
const mockServer = {
  seq: 0,
  records: new Map<string, SyncRecord & { seq: number }>(),
  view: { name: 'Home', code: 'ABCD-EF23', members: [{ name: 'Me', you: true, ref: '1111111111111111' }, { name: 'Sam', you: false, ref: '2222222222222222', idleDays: 70 }] } as HouseholdView,
  calls: 0,
  reset() {
    this.seq = 0;
    this.records.clear();
    this.calls = 0;
  },
  apply(changes: SyncRecord[]) {
    for (const c of changes) {
      const key = `${c.kind}:${c.id}`;
      const existing = this.records.get(key);
      if (existing && existing.updatedAt >= c.updatedAt) continue;
      this.records.set(key, { ...c, seq: ++this.seq });
    }
  },
  sync(since: number, changes: SyncRecord[]) {
    this.calls += 1;
    this.apply(changes);
    const out = [...this.records.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    return { cursor: this.seq, more: false, changes: out.map(({ seq: _s, ...r }) => r), household: this.view };
  },
};

jest.mock('../src/lib/api', () => {
  const actual = jest.requireActual('../src/lib/api');
  return {
    ...actual,
    isDemoMode: false,
    createHousehold: jest.fn(async () => mockServer.view),
    joinHousehold: jest.fn(async () => mockServer.view),
    getHousehold: jest.fn(async () => mockServer.view),
    removeHouseholdMember: jest.fn(async (_user: string, ref: string) => ({ ...mockServer.view, members: mockServer.view.members.filter((m) => m.ref !== ref) })),
    leaveHousehold: jest.fn(async () => {}),
    syncHousehold: jest.fn(async (_user: string, since: number, changes: SyncRecord[]) => mockServer.sync(since, changes)),
  };
});
jest.mock('../src/store/billing', () => ({ getProvider: () => ({ getUserId: async () => 'test-user' }) }));

const ITEM = (id: string, name: string, updatedAt: number, over: Partial<PantryItem> = {}): SyncRecord => ({
  kind: 'item',
  id,
  updatedAt,
  deleted: false,
  data: itemData(mk(id, name, '2026-10-08', { category: 'dairy', ...over })),
});

describe('merging the household lists', () => {
  it('reads items from other phones carefully', () => {
    expect(itemFrom('a', 5, ITEM('a', 'Milk', 5).data)).toMatchObject({ id: 'a', name: 'Milk', updatedAt: 5, status: 'active' });
    expect(itemFrom('a', 5, { name: 'Milk' })).toBeNull();
    expect(itemFrom('a', 5, { ...ITEM('a', 'Milk', 5).data, expiresOn: 'soon' })).toBeNull();
    expect(itemFrom('a', 5, { ...ITEM('a', 'Milk', 5).data, price: -3, currency: 'dollars' })).not.toHaveProperty('price');
    expect(shoppingFrom('s', 1, { name: 'Eggs', category: 'dairy', checked: 'yes', addedOn: '2026-10-01' })).toMatchObject({ checked: false });
  });

  it('keeps the newest version, remembers deletions and keeps local changes that are newer', () => {
    const local = [{ ...mk('a', 'Milk', '2026-10-08'), updatedAt: 10 }, { ...mk('b', 'Eggs', '2026-10-08'), updatedAt: 50 }];
    const res = merge(local, {}, [ITEM('a', 'Oat milk', 20), ITEM('b', 'Old eggs', 30), ITEM('c', 'Bread', 5), { kind: 'item', id: 'd', updatedAt: 9, deleted: true, data: null }], itemFrom);
    expect(res.list.map((i) => [i.id, i.name])).toEqual([
      ['c', 'Bread'],
      ['a', 'Oat milk'],
      ['b', 'Eggs'],
    ]);
    expect(res.deleted).toEqual({ d: 9 });
    // A deletion beats an older edit, and an older version arriving late changes nothing.
    const gone = merge(res.list, res.deleted, [{ kind: 'item', id: 'a', updatedAt: 25, deleted: true, data: null }, ITEM('a', 'Milk again', 22), ITEM('d', 'Back from the dead', 8)], itemFrom);
    expect(gone.list.map((i) => i.id)).toEqual(['c', 'b']);
    expect(gone.deleted).toEqual({ d: 9, a: 25 });
  });

  it('sends only what changed since the last sync, deletions included', () => {
    const items = [{ ...mk('a', 'Milk', '2026-10-08'), updatedAt: 10 }, { ...mk('b', 'Eggs', '2026-10-08'), updatedAt: 30 }];
    const out = outgoing('item', items, { x: 40, y: 5 }, 20, itemData);
    expect(out.map((r) => [r.id, r.deleted])).toEqual([
      ['b', false],
      ['x', true],
    ]);
    expect(out[0]!.data).not.toHaveProperty('id');
    expect(out[0]!.data).not.toHaveProperty('updatedAt');
  });

  it('stamps a change later than the version it replaces, even within the same millisecond', () => {
    expect(nextStamp(undefined, 100)).toBe(100);
    expect(nextStamp(100, 100)).toBe(101);
    expect(nextStamp(500, 100)).toBe(501);
  });

  it('forgets deletions after a while', () => {
    const now = 100 * TOMBSTONE_MS;
    expect(pruneTombstones({ old: now - TOMBSTONE_MS - 1, fresh: now - 1000 }, now)).toEqual({ fresh: now - 1000 });
  });
});

describe('syncing with the household', () => {
  beforeEach(() => {
    mockServer.reset();
    act(() => {
      useInventory.getState().clear();
      useShopping.getState().clear();
      useHousehold.setState({ household: null, memberName: '', cursor: 0, pushedUpTo: 0, lastSyncAt: null, syncing: false, error: null });
    });
  });

  it('shares what this phone has on joining, and brings in the housemate’s food', async () => {
    act(() => useInventory.getState().addItems([mk('mine', 'Milk', '2026-10-08', { category: 'dairy' })]));
    act(() => {
      useShopping.getState().add({ name: 'Bread', category: 'bakery' });
    });
    mockServer.apply([ITEM('sam-1', 'Halloumi', 1, { addedBy: 'Sam' })]);
    await act(async () => {
      await useHousehold.getState().join('ABCD-EF23', 'Me');
      await useHousehold.getState().sync();
    });
    const names = useInventory.getState().items.map((i) => i.name).sort();
    expect(names).toEqual(['Halloumi', 'Milk']);
    expect(mockServer.records.get('item:mine')?.data?.name).toBe('Milk');
    expect([...mockServer.records.keys()].some((k) => k.startsWith('shopping:'))).toBe(true);
    expect(useHousehold.getState().cursor).toBe(mockServer.seq);
  });

  it('signs new items with the person’s name and passes removals on', async () => {
    await act(async () => {
      await useHousehold.getState().create('Home', 'Me');
    });
    act(() => useInventory.getState().addItems([mk('n1', 'Yogurt', '2026-10-08', { category: 'dairy' })]));
    expect(useInventory.getState().items[0]!.addedBy).toBe('Me');
    await act(async () => {
      await useHousehold.getState().sync();
    });
    act(() => useInventory.getState().removeItem('n1'));
    await act(async () => {
      await useHousehold.getState().sync();
    });
    expect(mockServer.records.get('item:n1')).toMatchObject({ deleted: true, data: null });
  });

  it('takes the housemate’s newer edits and deletions, and sends nothing twice', async () => {
    await act(async () => {
      await useHousehold.getState().create('Home', 'Me');
    });
    act(() => useInventory.getState().addItems([mk('a', 'Milk', '2026-10-08', { category: 'dairy' }), mk('b', 'Eggs', '2026-10-08', { category: 'dairy' })]));
    await act(async () => {
      await useHousehold.getState().sync();
    });
    const later = Date.now() + 1000;
    mockServer.apply([ITEM('a', 'Oat milk', later), { kind: 'item', id: 'b', updatedAt: later, deleted: true, data: null }]);
    const sent = mockServer.seq;
    await act(async () => {
      await useHousehold.getState().sync();
    });
    expect(useInventory.getState().items.map((i) => i.name)).toEqual(['Oat milk']);
    // Nothing local changed, so nothing new reached the mockServer.
    expect(mockServer.seq).toBe(sent);
  });

  it('stops sharing, and keeps the lists, when the household is gone', async () => {
    await act(async () => {
      await useHousehold.getState().create('Home', 'Me');
    });
    act(() => useInventory.getState().addItems([mk('a', 'Milk', '2026-10-08', { category: 'dairy' })]));
    const api = jest.requireMock('../src/lib/api');
    const { ApiError } = jest.requireActual('../src/lib/api');
    api.syncHousehold.mockImplementationOnce(async () => {
      throw new ApiError('not_found', 'You are not in a household.');
    });
    await act(async () => {
      await useHousehold.getState().sync();
    });
    expect(useHousehold.getState().household).toBeNull();
    expect(useInventory.getState().items).toHaveLength(1);
  });

  it('learns when a household plan starts or stops covering everyone', async () => {
    await act(async () => {
      await useHousehold.getState().create('Home', 'Me');
    });
    const api = jest.requireMock('../src/lib/api');
    const { ApiError } = jest.requireActual('../src/lib/api');
    const until = Date.now() + 86_400_000;
    api.getHousehold.mockImplementationOnce(async () => ({ ...mockServer.view, coveredUntil: until, members: [{ name: 'Me', you: true }, { name: 'Sam', you: false, sponsor: true }] }));
    await act(async () => {
      await useHousehold.getState().refresh();
    });
    expect(isCovered(useHousehold.getState().household)).toBe(true);
    // The plan ended and this person has none of their own: the server says so, and the household stays.
    api.syncHousehold.mockImplementationOnce(async () => {
      throw new ApiError('payment_required', 'Start your free trial or subscribe to use this feature.');
    });
    await act(async () => {
      await useHousehold.getState().sync();
    });
    expect(useHousehold.getState().household).toMatchObject({ name: 'Home', coveredUntil: null });
    expect(isCovered(useHousehold.getState().household)).toBe(false);
    expect(useHousehold.getState().error).toBeNull();
  });

  it('takes someone else out of the household, and says why when it cannot', async () => {
    await act(async () => {
      await useHousehold.getState().create('Home', 'Me');
    });
    const api = jest.requireMock('../src/lib/api');
    const { ApiError } = jest.requireActual('../src/lib/api');
    let ok = false;
    await act(async () => {
      ok = await useHousehold.getState().removeMember('2222222222222222');
    });
    expect(ok).toBe(true);
    expect(api.removeHouseholdMember).toHaveBeenLastCalledWith('test-user', '2222222222222222');
    expect(useHousehold.getState().household?.members.map((m) => m.name)).toEqual(['Me']);
    api.removeHouseholdMember.mockImplementationOnce(async () => {
      throw new ApiError('not_found', 'That person is no longer in the household.');
    });
    await act(async () => {
      ok = await useHousehold.getState().removeMember('2222222222222222');
    });
    expect(ok).toBe(false);
    expect(useHousehold.getState().error).toBe('That person is no longer in the household.');
  });

  it('leaving keeps this phone’s copy', async () => {
    await act(async () => {
      await useHousehold.getState().create('Home', 'Me');
    });
    act(() => useInventory.getState().addItems([mk('a', 'Milk', '2026-10-08', { category: 'dairy' })]));
    await act(async () => {
      await useHousehold.getState().leave();
    });
    expect(useHousehold.getState().household).toBeNull();
    expect(useInventory.getState().items).toHaveLength(1);
    // New items are no longer signed.
    act(() => useInventory.getState().addItems([mk('b', 'Eggs', '2026-10-08', { category: 'dairy' })]));
    expect(useInventory.getState().items[0]!.addedBy).toBeUndefined();
  });
});
