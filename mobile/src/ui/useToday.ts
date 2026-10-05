import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

function startOfToday(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// The start of today, updated at midnight and when the app comes back to the
// foreground, so "Today" and "Yesterday" headings never go stale.
export function useToday(): number {
  const [today, setToday] = useState(startOfToday);

  useEffect(() => {
    const refresh = () => setToday(startOfToday());
    const next = new Date();
    next.setHours(24, 0, 1, 0);
    const timer = setTimeout(refresh, next.getTime() - Date.now());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      // Test environments return no subscription.
      subscription?.remove();
    };
  }, [today]);

  return today;
}
