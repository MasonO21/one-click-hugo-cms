// Demo mode: the whole engine runs in the browser over localStorage, with a
// sample circle of simulated people who check in on their own.

import { Sunup, type Action } from '../../shared/service';
import { buildSnapshot, type Snapshot } from '../../shared/snapshot';
import { emptyState, type Id, type Mood, type Packet, type State, type User } from '../../shared/types';
import { slotsAround, checkInFor } from '../../shared/schedule';
import { DAY, HOUR } from '../../shared/time';
import { SunupError } from '../../shared/util';
import { ApiError, type Api, type SignupInput } from './api';

const KEY = 'sunup.demo.v1';
/** Demo alerts play an hour of escalation in a minute. */
const DEMO_SPEED = 60;

interface Bot {
  notes: string[];
  moods: Mood[];
  /** While set, the bot doesn't check in (it's "gone quiet"). */
  quietUntil?: number;
}

interface DemoFile {
  state: State;
  meId: Id | null;
  bots: Record<Id, Bot>;
}

interface SamplePerson {
  name: string;
  start: string;
  deadline: string;
  notes: string[];
  moods: Mood[];
  packet?: Omit<Packet, 'updatedAt'>;
  /** Whether this person may see my packet. */
  getsMyPacket: boolean;
}

const SAMPLE: SamplePerson[] = [
  {
    name: 'Mom',
    start: '06:30',
    deadline: '09:30',
    notes: ['Garden looks happy today', 'Walked with Carol', 'Made banana bread', 'Slept like a rock', 'Book club tonight!', ''],
    moods: ['great', 'good', 'good', 'okay'],
    getsMyPacket: true,
    packet: {
      pets: 'Pepper (tabby cat): half a cup of dry food morning and night, fresh water. She hides under the bed when strangers come in. She\'s fine.',
      home: 'Lockbox on the back porch, code 2580. Carol next door (house #14) has a spare key.',
      health: 'Lisinopril 10mg every morning. Allergic to penicillin. Dr. Patel, Riverside Clinic, (555) 201-0188.',
      people: 'Aunt Ruth: (555) 201-0144. Church office: (555) 201-0170.',
      notes: 'Spare car key is in the kitchen drawer by the fridge.',
    },
  },
  {
    name: 'Jordan Rivera',
    start: '08:00',
    deadline: '11:00',
    notes: ['Gym, then work', 'Coffee #2', 'Rainy commute, all good', 'Big presentation today', 'Running late but alive', ''],
    moods: ['good', 'okay', 'great', 'meh'],
    getsMyPacket: false,
  },
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

function readFile(): DemoFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DemoFile) : null;
  } catch {
    return null;
  }
}

export function createDemoApi(): Api {
  const file: DemoFile = readFile() ?? { state: emptyState(), meId: null, bots: {} };
  const baseUrl = `${location.origin}${location.pathname}`;
  const svc = new Sunup(file.state, { baseUrl });
  const listeners = new Set<(snap: Snapshot) => void>();
  let fingerprint = '';

  const now = () => Date.now();
  const me = (): User => svc.user(file.meId!);
  const snapshot = (): Snapshot => buildSnapshot(svc, file.meId!, now());

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(file));
    } catch {
      // Private mode or full storage: the demo keeps working in memory.
    }
  }

  function guard<T>(fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof SunupError) throw new ApiError(e.code, e.message);
      throw e;
    }
  }

  function changed(): boolean {
    const s = file.state;
    const next = `${s.checkIns.length}|${s.outbox.length}|${JSON.stringify(s.alerts)}|${JSON.stringify(s.moments)}`;
    if (next === fingerprint) return false;
    fingerprint = next;
    return true;
  }

  function botCheckInTime(bot: User, slotKey: string, openAt: number, deadlineAt: number): number {
    const f = 0.1 + (hash(slotKey + bot.id) % 1000) / 1000 * 0.6;
    return Math.round(openAt + (deadlineAt - openAt) * f);
  }

  function runBots(t: number, from = t - DAY) {
    for (const [id, info] of Object.entries(file.bots)) {
      const bot = file.state.users[id];
      if (!bot || (info.quietUntil && info.quietUntil > t)) continue;
      const theirs = svc.checkInsOf(id);
      for (const slot of slotsAround(bot, t)) {
        const when = botCheckInTime(bot, slot.key, slot.openAt, slot.deadlineAt);
        if (when > t || when < from || checkInFor(slot, theirs)) continue;
        const h = hash(slot.key + 'mood' + id);
        svc.dispatch(id, { type: 'checkIn', mood: info.moods[h % info.moods.length], note: info.notes[h % info.notes.length] || undefined }, when);
      }
    }
  }

  /** Demo contacts "reply YES" to their consent text a few seconds after being added. */
  function runContacts(t: number) {
    for (const c of Object.values(file.state.contacts)) {
      if ((c.consent ?? 'pending') === 'pending' && t - c.createdAt > 6000) svc.contactReply(c.phone, 'YES', t);
    }
  }

  function tick() {
    if (!file.meId) return;
    const t = now();
    runBots(t);
    runContacts(t);
    svc.tick(t);
    svc.drain();
    // Keep localStorage small: photos only live for three days in the demo.
    for (const c of file.state.checkIns) if (c.photo && c.at < t - 3 * DAY) delete c.photo;
    if (changed()) {
      persist();
      const snap = snapshot();
      listeners.forEach((l) => l(snap));
    }
  }

  setInterval(tick, 1000);

  function addSampleCircle(): Snapshot {
    const t = now();
    const mine = me();
    for (const person of SAMPLE) {
      if (Object.values(file.state.users).some((u) => u.name === person.name && file.bots[u.id])) continue;
      const bot = svc.createUser({ name: person.name, timezone: mine.timezone }, t - 30 * DAY);
      bot.onboarded = true;
      bot.plan = 'premium';
      bot.schedule = { slots: [{ start: person.start, deadline: person.deadline }], days: [0, 1, 2, 3, 4, 5, 6], smart: false };
      bot.scheduleSince = t - 4 * DAY;
      bot.phone = `+1555201${String(1000 + (hash(person.name) % 9000)).slice(0, 4)}`;
      file.bots[bot.id] = { notes: person.notes, moods: person.moods };
      // Demo shortcut: skip the invite flow and connect both ways.
      file.state.watches[`w_${bot.id}_me`] = { id: `w_${bot.id}_me`, watcherId: bot.id, watchedId: mine.id, receivesPacket: person.getsMyPacket, createdAt: t };
      file.state.watches[`w_me_${bot.id}`] = { id: `w_me_${bot.id}`, watcherId: mine.id, watchedId: bot.id, receivesPacket: !!person.packet, createdAt: t };
      if (person.packet) file.state.packets[bot.id] = { ...person.packet, updatedAt: t };
    }
    runBots(t, t - 3 * DAY);
    svc.drain();
    persist();
    return snapshot();
  }

  function openDemoAlert(user: User) {
    const t = now();
    if (svc.alertsOf(user.id).some((a) => !a.resolvedAt)) return;
    svc.openAlert(user, 'missed', t, { speed: DEMO_SPEED });
    svc.tick(t);
  }

  const api: Api = {
    mode: 'demo',

    async load() {
      if (!file.meId || !file.state.users[file.meId]) return null;
      tick();
      return snapshot();
    },

    async signup(input: SignupInput) {
      return guard(() => {
        const user = svc.createUser(input, now());
        file.meId = user.id;
        persist();
        return snapshot();
      });
    },

    async act(action: Action) {
      return guard(() => {
        svc.dispatch(file.meId!, action, now());
        // A resolved alert means a bot that was "quiet" can resume.
        if (action.type === 'resolveAlert') {
          const alert = file.state.alerts[action.id];
          if (alert && file.bots[alert.userId]) file.bots[alert.userId].quietUntil = undefined;
        }
        svc.tick(now());
        svc.drain();
        changed();
        persist();
        return snapshot();
      });
    },

    async invite(code) {
      const user = svc.userByInviteCode(code);
      return user ? { name: user.name, color: user.color } : null;
    },

    inviteUrl(code) {
      return `${baseUrl}?join=${code}`;
    },

    async photo(ref) {
      return ref;
    },

    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async enablePush() {
      if (typeof Notification === 'undefined') return 'unsupported';
      try {
        const result = await Notification.requestPermission();
        return result === 'granted' ? 'granted' : 'denied';
      } catch {
        return 'unsupported';
      }
    },

    signOut() {
      api.demo!.reset();
    },

    async exportData() {
      return new Blob([JSON.stringify(svc.exportUser(file.meId!, now()), null, 2)], { type: 'application/json' });
    },

    async deleteAccount() {
      api.demo!.reset();
    },

    demo: {
      async addSampleCircle() {
        return addSampleCircle();
      },
      hasSampleCircle() {
        return Object.keys(file.bots).length > 0;
      },
      async simulateMyMiss() {
        openDemoAlert(me());
        persist();
        return snapshot();
      },
      async simulateFriendMiss(userId) {
        const bot = file.bots[userId];
        if (bot) bot.quietUntil = now() + 2 * HOUR;
        openDemoAlert(svc.user(userId));
        persist();
        return snapshot();
      },
      async setPlan(plan) {
        svc.setPlan(file.meId!, plan);
        persist();
        return snapshot();
      },
      reset() {
        try {
          localStorage.removeItem(KEY);
        } catch {
          // Nothing stored.
        }
        location.reload();
      },
    },
  };

  // Catch up right away when the tab wakes from sleep.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  return api;
}
