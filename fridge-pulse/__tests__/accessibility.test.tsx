/**
 * What screen reader users get: states that reach the web as aria props, rows that say their date,
 * messages and errors read out, steppers that say where they landed, and named dialogs.
 */
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Chip } from '../src/components/Chip';
import { DialogHost } from '../src/components/DialogHost';
import { ErrorText } from '../src/components/ErrorText';
import { ItemRow } from '../src/components/ItemRow';
import { SnackbarHost } from '../src/components/Snackbar';
import { Stepper } from '../src/components/Stepper';
import { addDays, todayISO } from '../src/lib/dates';
import { useDialog } from '../src/store/dialog';
import { useSnackbar } from '../src/store/snackbar';
import { mk } from '../test-utils/helpers';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useSegments: () => ['(tabs)', 'index'] }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
let spoken: jest.SpyInstance;
beforeEach(() => {
  spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => spoken.mockRestore());

async function render(node: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>);
  });
  return tree;
}
const pressables = (tree: ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => typeof n.props.onPress === 'function' && typeof n.type !== 'string');

describe('states the web can see', () => {
  it('a chip is a radio button that says whether it is picked', async () => {
    const tree = await render(
      <>
        <Chip testID="on" label="Fridge" selected onPress={() => {}} />
        <Chip testID="off" label="Freezer" onPress={() => {}} />
      </>,
    );
    const button = (id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && n.props.accessibilityRole !== undefined)[0]!;
    expect(button('on').props).toMatchObject({ accessibilityRole: 'radio', 'aria-checked': true });
    expect(button('off').props['aria-checked']).toBe(false);
  });
});

describe('item rows', () => {
  it('say how long the food has left, not just its name', async () => {
    const tree = await render(<ItemRow item={mk('s', 'Spinach', addDays(todayISO(), -2), { location: 'fridge' })} onPress={() => {}} onResolve={() => {}} />);
    const row = tree.root.findByProps({ testID: 'item-s' });
    expect(row.props.accessibilityLabel).toMatch(/^Spinach, Expired 2 days ago, /i);
    expect(row.props.accessibilityHint).not.toMatch(/swipe/i);
  });
});

describe('things that are read out', () => {
  it('every message bar, with its action', async () => {
    await render(<SnackbarHost />);
    await act(async () => {
      useSnackbar.getState().show({ message: 'Milk marked as used', action: { label: 'Undo', onPress: () => {} } });
    });
    expect(spoken).toHaveBeenCalledWith('Milk marked as used. Undo available.');
    act(() => {
      useSnackbar.getState().hide();
    });
  });

  it('an error when it appears', async () => {
    await render(<ErrorText>No food found in those photos.</ErrorText>);
    expect(spoken).toHaveBeenCalledWith('No food found in those photos.');
  });

  it('where a stepper landed after a press', async () => {
    function Holder() {
      const [n, setN] = jest.requireActual<typeof import('react')>('react').useState(2);
      return <Stepper label={`${n} people`} onDecrement={() => setN(n - 1)} onIncrement={() => setN(n + 1)} decrementLabel="One person fewer" incrementLabel="One person more" />;
    }
    const tree = await render(<Holder />);
    expect(spoken).not.toHaveBeenCalled();
    const more = pressables(tree).find((p) => p.props.accessibilityLabel === 'One person more')!;
    await act(async () => {
      more.props.onPress();
    });
    expect(spoken).toHaveBeenCalledWith('3 people');
  });
});

describe('dialogs', () => {
  it('are named by their title, and the backdrop is not something to focus', async () => {
    const tree = await render(<DialogHost />);
    // The in-app dialog is the web's (confirm() on a phone uses the system alert).
    let answer!: Promise<boolean>;
    await act(async () => {
      answer = useDialog.getState().ask({ title: 'Delete all data?', message: 'It cannot be undone.', confirmLabel: 'Delete', cancelLabel: 'Cancel', destructive: true });
    });
    const dialog = tree.root.findByProps({ testID: 'dialog' });
    expect(dialog.props).toMatchObject({ role: 'alertdialog', 'aria-modal': true, 'aria-labelledby': 'dialog-title' });
    expect(tree.root.findByProps({ nativeID: 'dialog-title' }).props.children).toBe('Delete all data?');
    expect(tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === 'Dismiss')).toHaveLength(0);
    await act(async () => {
      useDialog.getState().answer(false);
    });
    await expect(answer).resolves.toBe(false);
  });
});
