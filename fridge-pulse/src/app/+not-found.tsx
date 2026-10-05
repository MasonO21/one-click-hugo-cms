import { Redirect } from 'expo-router';
import { isUnlocked } from '../billing/trial';
import { useBilling } from '../store/billing';
import { isCovered, useHousehold } from '../store/household';
import { useSettings } from '../store/settings';

/**
 * Any unknown path (a host serving the app from a nested URL, an old deep link) lands on the
 * screen this person can actually reach. Redirecting to "/" is not enough: it is guarded until
 * onboarding is done and the trial or subscription is active, and a guarded target shows nothing.
 */
export default function NotFound() {
  const onboarded = useSettings((s) => s.onboarded);
  // The same access as the root layout: a plan of their own, or a household plan covering them.
  const subscribed = useBilling((s) => isUnlocked(s.entitlement));
  const covered = useHousehold((s) => isCovered(s.household));
  const unlocked = subscribed || covered;
  return <Redirect href={!onboarded ? '/onboarding' : unlocked ? '/' : '/paywall'} />;
}
