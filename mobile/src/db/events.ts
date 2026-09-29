type Listener = () => void;

const listeners = new Set<Listener>();

// Lets screens refresh when entries or outings change, including changes that finish
// after the screen that started them is gone (weather and place lookups).
export function subscribeToDataChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyDataChanged(): void {
  listeners.forEach((listener) => listener());
}
