import type { useRouter } from 'expo-router';

// Goes back if there is a screen to go back to, otherwise to the log. A screen opened
// from a link or after a restart has no history behind it.
export function goBack(router: ReturnType<typeof useRouter>): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
