import { create } from 'zustand';

export interface DialogRequest {
  title: string;
  message: string;
  confirmLabel: string;
  /** Null for a one-button message. */
  cancelLabel: string | null;
  destructive: boolean;
  resolve: (confirmed: boolean) => void;
}

interface DialogState {
  current: DialogRequest | null;
  queue: DialogRequest[];
  ask: (request: Omit<DialogRequest, 'resolve'>) => Promise<boolean>;
  answer: (confirmed: boolean) => void;
}

/**
 * In-app dialogs for web, where the browser's alert/confirm are unavailable (React Native's
 * Alert does nothing there, and embedded viewers suppress window.confirm). Requests queue so
 * two dialogs never overlap, and each promise resolves exactly once.
 */
export const useDialog = create<DialogState>((set, get) => ({
  current: null,
  queue: [],
  ask: (request) =>
    new Promise<boolean>((resolve) => {
      const full: DialogRequest = { ...request, resolve };
      if (get().current) set((s) => ({ queue: [...s.queue, full] }));
      else set({ current: full });
    }),
  answer: (confirmed) => {
    const { current, queue } = get();
    if (!current) return;
    const [next, ...rest] = queue;
    set({ current: next ?? null, queue: rest });
    current.resolve(confirmed);
  },
}));
