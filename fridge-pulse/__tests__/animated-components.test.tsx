import { act, create, type ReactTestRendererJSON } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BurstLayer } from '../src/components/BurstLayer';
import { ImpactCard } from '../src/components/ImpactCard';
import { Logo } from '../src/components/Logo';
import { MealCard } from '../src/components/MealCard';
import { PulseBar } from '../src/components/PulseBar';
import { SnackbarHost } from '../src/components/Snackbar';
import { computeImpact, NO_LIFETIME } from '../src/lib/impact';
import { useBurst } from '../src/store/burst';
import { useSnackbar } from '../src/store/snackbar';
import { mk, NOW } from '../test-utils/helpers';

jest.mock('expo-router', () => ({ useSegments: () => ['(tabs)'] }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}), impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: {} }));

/** All visible text, joined up (React splits "2-day" into "2" and "-day"). */
function textOf(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children ?? []).map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

// Every animated component renders and runs its animations to the end without throwing (an invalid
// interpolation range, for example, only fails at render time).
describe('animated components render and animate', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const run = () =>
    act(() => {
      jest.advanceTimersByTime(5000);
    });

  it('Impact card with a busy week', () => {
    const items = [
      mk('1', 'Milk', '2026-09-30', { status: 'used', resolvedOn: '2026-09-29' }),
      mk('2', 'Bread', '2026-09-27', { status: 'wasted', resolvedOn: '2026-09-27' }),
    ];
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ImpactCard impact={computeImpact(items, { ...NO_LIFETIME, rescued: 3, used: 4, wasted: 1, startedOn: '2026-09-01', lastWastedOn: '2026-09-27' }, NOW)} />);
    });
    run();
    const text = textOf(tree.toJSON());
    expect(text).toContain('2-day no-waste streak');
    expect(text).toContain('2 more rescues to reach 5');
  });

  it('Freshness bar and beating logo', () => {
    act(() => {
      create(<PulseBar summary={{ total: 3, counts: { expired: 1, today: 0, soon: 1, week: 0, ok: 1 } }} />);
      create(<Logo size={40} beat="quick" />);
      create(<Logo size={40} beat="calm" />);
    });
    run();
  });

  it('Meal card opening and closing', () => {
    let tree!: ReturnType<typeof create>;
    const meal = { id: 'm', title: 'Omelette', summary: '', minutes: 10, servings: 2, uses: ['Eggs', 'eggs', 'Milk'], extras: [], steps: ['Whisk.', 'Cook.'], source: 'local' as const };
    act(() => {
      tree = create(<MealCard meal={meal} defaultOpen onCooked={() => {}} />);
    });
    run();
    // Repeated ingredients are listed once.
    expect(JSON.stringify(tree.toJSON()).match(/"Eggs"/g)).toHaveLength(1);
    act(() => tree.root.findAll((n) => n.props.testID === 'meal-m' && typeof n.props.onPress === 'function')[0]!.props.onPress());
    run();
  });

  it('Message bar showing, counting down and hiding', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <SnackbarHost />
        </SafeAreaProvider>,
      );
    });
    act(() => useSnackbar.getState().show({ message: 'Nice save! Milk rescued', tone: 'rescue', action: { label: 'Undo', onPress: () => {} } }));
    expect(textOf(tree.toJSON())).toContain('Nice save! Milk rescued');
    run();
    run();
    expect(useSnackbar.getState().snack).toBeNull();
  });

  it('Celebration burst plays and clears itself', () => {
    act(() => {
      create(<BurstLayer />);
    });
    act(() => useBurst.getState().emit(100, 200));
    expect(useBurst.getState().bursts).toHaveLength(1);
    run();
    expect(useBurst.getState().bursts).toHaveLength(0);
  });
});
