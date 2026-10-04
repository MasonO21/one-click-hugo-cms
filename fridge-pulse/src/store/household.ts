import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ApiError,
  createHousehold,
  friendlyError,
  isDemoMode,
  joinHousehold,
  leaveHousehold,
  newHouseholdCode,
  syncHousehold,
  type HouseholdView,
  type SyncRecord,
} from '../lib/api';
import { addDays, todayISO } from '../lib/dates';
import { itemData, itemFrom, merge, nextStamp, outgoing, shoppingData, shoppingFrom } from '../lib/householdSync';
import { newId } from '../lib/scan';
import { getProvider } from './billing';
import { setItemAuthor, useInventory } from './inventory';
import { setShoppingAuthor, useShopping } from './shopping';
import { persistStorage } from './storage';

interface HouseholdState {
  household: HouseholdView | null;
  /** The name this phone's person goes by in the household. */
  memberName: string;
  /** The server's change number this phone has seen up to. */
  cursor: number;
  /** Local changes up to this time (ms) have been sent. */
  pushedUpTo: number;
  lastSyncAt: number | null;
  syncing: boolean;
  error: string | null;
  create: (name: string, memberName: string) => Promise<boolean>;
  join: (code: string, memberName: string) => Promise<boolean>;
  leave: () => Promise<boolean>;
  newCode: () => Promise<void>;
  sync: () => Promise<void>;
}

/** Every item and shopping entry counts as changed now, so joining shares what this phone already has. */
function stampEverything(): void {
  const now = Date.now();
  const inv = useInventory.getState();
  inv.applyRemote(inv.items.map((i) => ({ ...i, updatedAt: nextStamp(i.updatedAt, now) })), inv.deleted);
  const shop = useShopping.getState();
  shop.applyRemote(shop.items.map((i) => ({ ...i, updatedAt: nextStamp(i.updatedAt, now) })), shop.deleted);
}

/** In the preview there is no server: a made-up household with a sample housemate and two of their items. */
function demoHousehold(name: string, memberName: string, joined: boolean): HouseholdView {
  const code = `${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase().replace(/[01ILO]/g, '7');
  return { name, code, members: joined ? [{ name: 'Sam (sample)', you: false }, { name: memberName, you: true }] : [{ name: memberName, you: true }] };
}

function addDemoHousemateFood(): void {
  const today = todayISO();
  const now = Date.now();
  const items = [
    { name: 'Oat milk', category: 'drinks' as const, quantity: '1 carton', location: 'fridge' as const, days: 6 },
    { name: 'Halloumi', category: 'dairy' as const, quantity: '1 block', location: 'fridge' as const, days: 2 },
  ].map((f) => ({
    id: newId(),
    name: f.name,
    category: f.category,
    quantity: f.quantity,
    location: f.location,
    addedOn: today,
    expiresOn: addDays(today, f.days),
    expirySource: 'estimate' as const,
    status: 'active' as const,
    addedBy: 'Sam (sample)',
    updatedAt: now,
  }));
  const inv = useInventory.getState();
  inv.applyRemote([...items, ...inv.items], inv.deleted);
  const shop = useShopping.getState();
  shop.applyRemote([{ id: `s-${newId()}`, name: 'Coffee beans', category: 'drinks', checked: false, addedOn: today, addedBy: 'Sam (sample)', updatedAt: now }, ...shop.items], shop.deleted);
}

const message = (e: unknown) => friendlyError(e).message;

export const useHousehold = create<HouseholdState>()(
  persist(
    (set, get) => ({
      household: null,
      memberName: '',
      cursor: 0,
      pushedUpTo: 0,
      lastSyncAt: null,
      syncing: false,
      error: null,

      create: async (name, memberName) => {
        set({ error: null });
        try {
          const household = isDemoMode ? demoHousehold(name, memberName, false) : await createHousehold(await getProvider().getUserId(), name, memberName);
          stampEverything();
          set({ household, memberName, cursor: 0, pushedUpTo: 0 });
          void get().sync();
          return true;
        } catch (e) {
          set({ error: message(e) });
          return false;
        }
      },

      join: async (code, memberName) => {
        set({ error: null });
        try {
          const household = isDemoMode ? demoHousehold('The Sample Kitchen', memberName, true) : await joinHousehold(await getProvider().getUserId(), code, memberName);
          stampEverything();
          set({ household, memberName, cursor: 0, pushedUpTo: 0 });
          if (isDemoMode) addDemoHousemateFood();
          void get().sync();
          return true;
        } catch (e) {
          set({ error: message(e) });
          return false;
        }
      },

      leave: async () => {
        set({ error: null });
        try {
          if (!isDemoMode) await leaveHousehold(await getProvider().getUserId());
        } catch (e) {
          // Already gone on the server is fine; anything else is worth saying.
          if (!(e instanceof ApiError && e.code === 'not_found')) {
            set({ error: message(e) });
            return false;
          }
        }
        // This phone keeps its copy of the lists.
        set({ household: null, cursor: 0, pushedUpTo: 0, lastSyncAt: null });
        return true;
      },

      newCode: async () => {
        const { household, memberName } = get();
        if (!household) return;
        try {
          set({ household: isDemoMode ? { ...demoHousehold(household.name, memberName, false), members: household.members } : await newHouseholdCode(await getProvider().getUserId()), error: null });
        } catch (e) {
          set({ error: message(e) });
        }
      },

      sync: async () => {
        if (!get().household || get().syncing) return;
        if (isDemoMode) {
          set({ lastSyncAt: Date.now(), error: null });
          return;
        }
        set({ syncing: true });
        try {
          const userId = await getProvider().getUserId();
          // Anything stamped at this very millisecond goes again next time; sending twice is harmless.
          const startedAt = Date.now() - 1;
          const inv = useInventory.getState();
          const shop = useShopping.getState();
          const since = get().pushedUpTo;
          let changes: SyncRecord[] = [...outgoing('item', inv.items, inv.deleted, since, itemData), ...outgoing('shopping', shop.items, shop.deleted, since, shoppingData)];
          let cursor = get().cursor;
          for (let page = 0; page < 20; page += 1) {
            const res = await syncHousehold(userId, cursor, changes.slice(0, 500));
            changes = changes.slice(500);
            cursor = res.cursor;
            const items = res.changes.filter((r) => r.kind === 'item');
            const shopping = res.changes.filter((r) => r.kind === 'shopping');
            if (items.length > 0) {
              const now = useInventory.getState();
              const merged = merge(now.items, now.deleted, items, itemFrom);
              if (merged.changed) now.applyRemote(merged.list, merged.deleted);
            }
            if (shopping.length > 0) {
              const now = useShopping.getState();
              const merged = merge(now.items, now.deleted, shopping, shoppingFrom);
              if (merged.changed) now.applyRemote(merged.list, merged.deleted);
            }
            set({ household: res.household, cursor });
            if (!res.more && changes.length === 0) break;
          }
          set({ pushedUpTo: startedAt, lastSyncAt: Date.now(), error: null });
        } catch (e) {
          // Removed from the household elsewhere (or it was deleted): stop sharing, keep the lists.
          if (e instanceof ApiError && e.code === 'not_found') set({ household: null, cursor: 0, pushedUpTo: 0, error: 'You are no longer in a household.' });
          else set({ error: message(e) });
        } finally {
          set({ syncing: false });
        }
      },
    }),
    {
      name: 'fp.household.v1',
      version: 1,
      storage: persistStorage(),
      partialize: (s) => ({ household: s.household, memberName: s.memberName, cursor: s.cursor, pushedUpTo: s.pushedUpTo, lastSyncAt: s.lastSyncAt }),
    },
  ),
);

// New items and shopping entries carry the person's name while the phone shares a household.
useHousehold.subscribe((s) => {
  const name = s.household ? s.memberName : null;
  setItemAuthor(name);
  setShoppingAuthor(name);
});
