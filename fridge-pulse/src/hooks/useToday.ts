import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { todayISO } from '../lib/dates';

/**
 * Today's date (YYYY-MM-DD) that moves on by itself at midnight and when the app returns to the
 * foreground, so "Expires today" does not linger into tomorrow on a screen left open overnight.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, next.getTime() - now.getTime());
    };
    schedule();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
  return today;
}
