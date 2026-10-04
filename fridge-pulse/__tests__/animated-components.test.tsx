import { act, create, type ReactTestRendererJSON } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BurstLayer } from '../src/components/BurstLayer';
import { Button } from '../src/components/Button';
import { FreshnessMeter } from '../src/components/FreshnessMeter';
import { HeartbeatLine } from '../src/components/HeartbeatLine';
import { ImpactCard } from '../src/components/ImpactCard';
import { GoalBar } from '../src/components/GoalBar';
import { Logo } from '../src/components/Logo';
import { WeeklyScoreCard } from '../src/components/WeeklyScoreCard';
import { MacroTiles } from '../src/components/Macros';
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

  it('Meal card with figures per serving, and the macro bar growing in', () => {
    let tree!: ReturnType<typeof create>;
    const meal = {
      id: 'n',
      title: 'Omelette',
      summary: '',
      minutes: 10,
      servings: 2,
      uses: ['Eggs', 'Gochujang'],
      extras: [],
      steps: ['Cook.'],
      source: 'local' as const,
      nutrition: { kcal: 366, protein: 20, carbs: 4, fat: 30, counted: 1, total: 2 },
    };
    act(() => {
      tree = create(<MealCard meal={meal} defaultOpen />);
      create(<MacroTiles macros={{ kcal: 0, protein: 0, carbs: 0, fat: 0 }} />);
    });
    run();
    const text = textOf(tree.toJSON());
    expect(text).toContain('366 kcal');
    expect(text).toContain('Per serving');
    expect(text).toContain('20 g');
    expect(text).toContain('1 of 2 ingredients');
  });

  it('Goal bars, the weekly score and the money on the impact card', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <>
          <GoalBar label="g protein" unit="g" value={62} target={130} color="#00f" />
          <GoalBar label="kcal" unit="kcal" value={2400} target={2100} color="#f80" />
          <WeeklyScoreCard
            week={{
              score: 71,
              message: 'A good week, with room to grow.',
              parts: [
                { key: 'food', label: 'Food used, not wasted', ratio: 0.8, detail: '8 used, 2 thrown out', hint: null },
                { key: 'protein', label: 'Protein goal met', ratio: null, detail: 'No goal set', hint: 'Set a protein goal to count this.' },
                { key: 'active', label: 'Active days', ratio: 0.6, detail: '3 of 5', hint: null },
              ],
            }}
          />
          <ImpactCard
            impact={computeImpact([], { ...NO_LIFETIME, rescued: 1, used: 1, startedOn: '2026-09-01' }, NOW)}
            money={{ currency: 'USD', rescued: 41, wasted: 23.5, used: 60, priced: 9 }}
          />
        </>,
      );
    });
    run();
    const text = textOf(tree.toJSON());
    expect(text).toContain('62 of 130 g protein');
    expect(text).toContain('68 g to go');
    expect(text).toContain('Target reached');
    expect(text).toContain('71');
    expect(text).toContain('Set a protein goal to count this.');
    expect(text).toContain('rescued this month');
    expect(text).toContain('From receipt prices on 9 items.');
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

  it('Freshness meter fills to the score', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<FreshnessMeter score={73} />);
    });
    expect(textOf(tree.toJSON())).toBe('0');
    run();
    expect(textOf(tree.toJSON())).toBe('73');
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Freshness score 73 out of 100').length).toBeGreaterThan(0);
  });

  it('Heartbeat trace scrolls once it knows its width', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<HeartbeatLine pace="quick" />);
    });
    const strip = tree.root.findAll((n) => typeof n.props.onLayout === 'function')[0]!;
    act(() => strip.props.onLayout({ nativeEvent: { layout: { width: 320, height: 32, x: 0, y: 0 } } }));
    run();
  });

  it('The orange call to action and its gradient', () => {
    act(() => {
      create(<Button variant="cta" label="Scan your fridge" icon="scan" onPress={() => {}} />);
      create(<Button variant="primary" label="Next" onPress={() => {}} loading />);
    });
    run();
  });
});
