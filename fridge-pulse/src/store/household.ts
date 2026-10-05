import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ApiError,
  createHousehold,
  friendlyError,
  getHousehold,
  isDemoMode,
  joinHousehold,
  leaveHousehold,
  newHouseholdCode,
  removeHouseholdMember,
  syncHousehold,
  type HouseholdView,
  type SyncRecord,
} from '../lib/api';
import { addDays, todayISO } from '../lib/dates';
import { itemData, itemFrom, merge, nextStamp, outgoing, shoppingData, shoppingFrom } from '../lib/householdSync';
import { newId } from '../lib/scan';
import { getProvider, useBilling } from './billing';
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
  /** Takes someone else out of the household (an old phone, someone who moved out). */
  removeMember: (ref: string) => Promise<boolean>;
  sync: () => Promise<void>;
  /** Asks the server for the household again, for its members and whether a household plan covers it. */
  refresh: () => Promise<void>;
}

/** A member's household plan covers everyone in this household right now. */
export function isCovered(h: HouseholdView | null | undefined, now: number = Date.now()): boolean {
  return h?.coveredUntil != null && h.coveredUntil > now;
}

/** The person whose household plan covers everyone, if it is someone else. */
export function sponsorName(h: HouseholdView | null | undefined): string | null {
  const s = h?.members.find((m) => m.sponsor);
  return s && !s.you ? s.name : null;
}

/** Every item and shopping entry counts as changed now, so joining shares what this phone already has. */
function stampEverything(): void {
  const now = Date.now();
  const inv = useInventory.getState();
  inv.applyRemote(inv.items.map((i) => ({ ...i, updatedAt: nextStamp(i.updatedAt, now) })), inv.deleted);
  const shop = useShopping.getState();
  shop.applyRemote(shop.items.map((i) => ({ ...i, updatedAt: nextStamp(i.updatedAt, now) })), shop.deleted);
}

const DEMO_HOUSEMATE = 'Sam (sample)';

/**
 * In the preview there is no server: a made-up household, and on joining a sample housemate with two
 * of their items. The housemate pays for the household plan, so joining shows what being covered is like.
 */
function demoHousehold(name: string, memberName: string, joined: boolean): HouseholdView {
  const code = `${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase().replace(/[01ILO]/g, '7');
  const you = { name: memberName, you: true, ref: 'demo-you' };
  const members = joined ? [{ name: DEMO_HOUSEMATE, you: false, sponsor: true, ref: 'demo-sam' }, you] : [you];
  return withDemoCoverage({ name, code, members, coveredUntil: null });
}

/** What the server would work out: whoever is on a household plan covers everyone. */
function withDemoCoverage(h: HouseholdView): HouseholdView {
  const e = useBilling.getState().entitlement;
  const mine = e.household && e.endsOn ? new Date(`${e.endsOn}T23:59:59`).getTime() : null;
  const sample = h.members.some((m) => m.name === DEMO_HOUSEMATE) ? Date.now() + 30 * 86_400_000 : null;
  const until = Math.max(mine ?? 0, sample ?? 0) || null;
  const youPay = mine != null && mine >= (sample ?? 0);
  return {
    ...h,
    members: h.members.map(({ sponsor: _s, ...m }) => ((m.you ? youPay : m.name === DEMO_HOUSEMATE && !youPay && sample != null) ? { ...m, sponsor: true } : m)),
    coveredUntil: until,
  };
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
    addedBy: DEMO_HOUSEMATE,
    updatedAt: now,
  }));
  const inv = useInventory.getState();
  inv.applyRemote([...items, ...inv.items], inv.deleted);
  const shop = useShopping.getState();
  shop.applyRemote([{ id: `s-${newId()}`, name: 'Coffee beans', category: 'drinks', checked: false, addedOn: today, addedBy: DEMO_HOUSEMATE, updatedAt: now }, ...shop.items], shop.deleted);
}

const message = (e: unknown) => friendlyError(e).message;
const uncovered = (h: HouseholdView | null): HouseholdView | null => (h ? { ...h, coveredUntil: null } : null);

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
          set({ household: isDemoMode ? { ...household, code: demoHousehold(household.name, memberName, false).code } : await newHouseholdCode(await getProvider().getUserId()), error: null });
        } catch (e) {
          set({ error: message(e) });
        }
      },

      removeMember: async (ref) => {
        const household = get().household;
        if (!household) return false;
        set({ error: null });
        try {
          const next = isDemoMode
            ? withDemoCoverage({ ...household, members: household.members.filter((m) => m.ref !== ref) })
            : await removeHouseholdMember(await getProvider().getUserId(), ref);
          set({ household: next });
          return true;
        } catch (e) {
          set({ error: message(e) });
          return false;
        }
      },

      sync: async () => {
        if (!get().household || get().syncing) return;
        if (isDemoMode) {
          set({ household: withDemoCoverage(get().household!), lastSyncAt: Date.now(), error: null });
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
          // No plan of your own and nobody's household plan covers you: the paywall says so.
          else if (e instanceof ApiError && e.code === 'payment_required') set({ household: uncovered(get().household), error: null });
          else set({ error: message(e) });
        } finally {
          set({ syncing: false });
        }
      },

      refresh: async () => {
        const current = get().household;
        if (!current) return;
        if (isDemoMode) {
          set({ household: withDemoCoverage(current) });
          return;
        }
        try {
          const household = await getHousehold(await getProvider().getUserId());
          if (household) set({ household, error: null });
          else set({ household: null, cursor: 0, pushedUpTo: 0, error: 'You are no longer in a household.' });
        } catch (e) {
          if (e instanceof ApiError && e.code === 'payment_required') set({ household: uncovered(get().household) });
          // Offline: keep what is known.
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
