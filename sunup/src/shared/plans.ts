import type { User } from './types';
import { DAY } from './time';

export const PRICE_MONTHLY = 9.99;
export const PRICE_YEARLY = 79.99;
export const TRIAL_DAYS = 7;
export const TRIAL_MS = TRIAL_DAYS * DAY;

export interface Limits {
  premium: boolean;
  maxWatchers: number;
  maxSlots: number;
  moments: boolean;
  packetRelease: boolean;
  smartCheckIn: boolean;
  calls: boolean;
}

export function isPremium(user: User, now: number): boolean {
  return user.plan === 'premium' || (user.trialEndsAt ?? 0) > now;
}

export function limitsFor(user: User, now: number): Limits {
  const premium = isPremium(user, now);
  return {
    premium,
    maxWatchers: premium ? 50 : 2,
    maxSlots: premium ? 3 : 1,
    moments: premium,
    packetRelease: premium,
    smartCheckIn: premium,
    calls: premium,
  };
}

export const PREMIUM_FEATURES: { title: string; detail: string }[] = [
  { title: 'Full escalation ladder', detail: 'Alarm, a phone call to you, then calls to your circle.' },
  { title: '"If I go dark" packet', detail: 'Pet care, door code and meds, released only when it matters.' },
  { title: 'Moments', detail: 'Date, run, night out and travel timers, plus a fake-call escape.' },
  { title: 'Smart check-in', detail: 'Opening Sunup in your window checks you in automatically.' },
  { title: 'Unlimited circle', detail: 'Free covers 2 people. Premium covers everyone who cares.' },
  { title: 'Up to 3 check-ins a day', detail: 'Add an evening "home safe" window.' },
];
