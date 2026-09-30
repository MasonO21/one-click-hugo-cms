import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ItemRow } from '../src/components/ItemRow';
import { mk } from '../test-utils/helpers';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}), impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: {} }));

const find = (tree: ReactTestRenderer, id: string) => tree.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0]!;

describe('ItemRow', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function render() {
    const onResolve = jest.fn();
    const onPress = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<ItemRow item={mk('a', 'Milk', '2026-10-01')} onPress={onPress} onResolve={onResolve} />);
    });
    return { tree, onResolve, onPress };
  }

  it('marks the item used from the check button, once, after its exit animation', () => {
    const { tree, onResolve } = render();
    act(() => {
      find(tree, 'used-a').props.onPress();
      find(tree, 'used-a').props.onPress(); // a double tap
    });
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('used');
  });

  it('offers screen-reader actions for used and thrown out, since swiping is not accessible', () => {
    const { tree, onResolve, onPress } = render();
    const row = find(tree, 'item-a');
    expect(row.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['activate', 'used', 'wasted']);
    act(() => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'wasted' } }));
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onResolve).toHaveBeenCalledWith('wasted');
    act(() => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows no swipe or check button when the row is read-only', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<ItemRow item={mk('b', 'Rice', '2027-01-01')} onPress={() => {}} />);
    });
    expect(tree.root.findAll((n) => n.props.testID === 'used-b')).toHaveLength(0);
  });
});
