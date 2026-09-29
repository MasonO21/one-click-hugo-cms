import { useEffect, useState } from 'react';
import { subscribeToDataChanges } from '@/db/events';

// A number that changes whenever entries or outings change. Add it to an effect's
// dependencies to reload data after any edit, including ones that finish later.
export function useDataVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeToDataChanges(() => setVersion((v) => v + 1)), []);
  return version;
}
