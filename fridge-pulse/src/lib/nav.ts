import { router } from 'expo-router';

/**
 * Closes the current screen. When there is nothing to go back to (a deep link, or the web preview
 * reloaded on a detail page) it goes to the Pulse tab instead of doing nothing.
 */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Closes a stack of modals (scan, review) and returns to the tab that opened them. */
export function closeModals(): void {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}
