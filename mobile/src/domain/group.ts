import { dayKey, formatDay } from './format';

export interface DaySection<T> {
  key: string;
  title: string;
  data: T[];
}

// Groups entries (already newest first) into one section per calendar day.
export function groupByDay<T extends { createdAt: number; timeZone?: string | null }>(
  items: T[],
  now: number = Date.now(),
): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  for (const item of items) {
    const key = dayKey(item.createdAt, item.timeZone);
    const last = sections[sections.length - 1];
    if (last && last.key === key) {
      last.data.push(item);
    } else {
      sections.push({ key, title: formatDay(item.createdAt, now, undefined, item.timeZone), data: [item] });
    }
  }
  return sections;
}
