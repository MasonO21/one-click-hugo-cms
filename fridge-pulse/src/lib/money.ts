import { getLocales } from 'expo-localization';
import { isRescue } from './impact';
import type { PantryItem } from './types';

/** The phone's currency ("USD", "GBP"), for prices typed in by hand. */
export function deviceCurrency(): string {
  try {
    const code = getLocales()[0]?.currencyCode;
    return code && /^[A-Z]{3}$/.test(code) ? code : 'USD';
  } catch {
    return 'USD';
  }
}

/** An amount in its currency, the way the phone writes money; whole amounts without cents. */
export function formatMoney(amount: number, currency: string): string {
  const whole = Math.abs(amount - Math.round(amount)) < 0.005;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(whole ? 0 : 2)}`;
  }
}

/** A price worth keeping: a positive amount under 10,000, to the cent. */
export function cleanPrice(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  // Rounded first, so a fraction of a cent is not kept as a price of nothing.
  const cents = Math.round(raw * 100) / 100;
  return cents > 0 && cents < 10000 ? cents : null;
}

/** A currency code worth keeping. */
export function cleanCurrency(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Z]{3}$/.test(raw.trim().toUpperCase()) ? raw.trim().toUpperCase() : null;
}

export interface MoneySummary {
  currency: string;
  /** Paid for food thrown out this month. */
  wasted: number;
  /** Paid for food rescued (used in its last three days) this month. */
  rescued: number;
  /** Paid for all food used this month. */
  used: number;
  /** Items with a price that were used or thrown out this month. */
  priced: number;
}

/**
 * What the food used and thrown out this calendar month cost, from the prices on receipts (or typed
 * in). Only items with a price count; nothing is estimated. With several currencies, the most used one.
 */
export function moneyThisMonth(items: PantryItem[], today: string, fallback: string = deviceCurrency()): MoneySummary | null {
  const month = today.slice(0, 7);
  const done = items.filter((i) => i.status !== 'active' && i.resolvedOn?.startsWith(month) && i.resolvedOn <= today && cleanPrice(i.price) !== null);
  if (done.length === 0) return null;
  const counts = new Map<string, number>();
  for (const i of done) counts.set(i.currency ?? fallback, (counts.get(i.currency ?? fallback) ?? 0) + 1);
  const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const sum = { currency, wasted: 0, rescued: 0, used: 0, priced: 0 };
  for (const i of done) {
    if ((i.currency ?? fallback) !== currency) continue;
    const price = cleanPrice(i.price)!;
    sum.priced += 1;
    if (i.status === 'wasted') sum.wasted += price;
    else {
      sum.used += price;
      if (isRescue(i)) sum.rescued += price;
    }
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { ...sum, wasted: r(sum.wasted), rescued: r(sum.rescued), used: r(sum.used) };
}
