import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { AddItemField } from '../src/components/AddItemField';
import { useInventory } from '../src/store/inventory';
import { useScanDraft } from '../src/store/scanDraft';

jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => data.get(k) ?? null,
      setItem: async (k: string, v: string) => void data.set(k, v),
      removeItem: async (k: string) => void data.delete(k),
    },
  };
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}), impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: {} }));

const byTestId = (tree: ReactTestRenderer, id: string) => tree.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string')[0];
const textOf = (node: ReactTestInstance) => JSON.stringify(node.props.children ?? '');

function render(added: string[] = [], location: 'fridge' | 'freezer' | 'pantry' = 'fridge') {
  const onAdd = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<AddItemField location={location} added={added} onAdd={onAdd} />);
  });
  const type = (text: string) =>
    act(() => {
      byTestId(tree, 'add-name').props.onChangeText(text);
    });
  // Each row appears once per wrapper component, so keep one node per testID.
  const labels = () => {
    const rows = new Map<string, string>();
    for (const n of tree.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('suggestion-'))) {
      if (!rows.has(n.props.testID)) rows.set(n.props.testID, n.props.accessibilityLabel);
    }
    return [...rows.values()];
  };
  return { tree, onAdd, type, labels };
}

beforeEach(() => {
  act(() => {
    useInventory.setState({ items: [] });
  });
});

describe('AddItemField', () => {
  it('shows no suggestions until something is typed', () => {
    const { tree, labels } = render();
    expect(labels()).toEqual([]);
    expect(byTestId(tree, 'suggestions')).toBeUndefined();
  });

  it('suggests foods while typing and adds the one tapped, with its category', () => {
    const { tree, onAdd, type, labels } = render();
    type('straw');
    expect(labels()[0]).toBe('Add Strawberries');
    // The caption tells the person how long it keeps where they are storing it.
    expect(byTestId(tree, 'suggestion-0').props.accessibilityHint).toBe('Keeps about 5 days');

    act(() => {
      byTestId(tree, 'suggestion-0').props.onPress();
    });
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Strawberries', category: 'produce' }));
    // The field clears, ready for the next item.
    expect(byTestId(tree, 'add-name').props.value).toBe('');
    expect(labels()).toEqual([]);
  });

  it('forgives typos', () => {
    const { type, labels } = render();
    type('brocoli');
    expect(labels()).toEqual(['Add Broccoli']);
  });

  it('adds typed text with the return key, tidied to a known food when it is one', () => {
    const { tree, onAdd, type } = render();
    type('milk');
    act(() => {
      byTestId(tree, 'add-name').props.onSubmitEditing();
    });
    expect(onAdd).toHaveBeenLastCalledWith({ name: 'Milk', category: 'dairy' });

    type("Grandma's chutney");
    act(() => {
      byTestId(tree, 'add-typed').props.onPress();
    });
    expect(onAdd).toHaveBeenLastCalledWith({ name: "Grandma's chutney", category: 'condiments' });
  });

  it('ignores Add with nothing typed', () => {
    const { tree, onAdd, type } = render();
    type('   ');
    act(() => {
      byTestId(tree, 'add-name').props.onSubmitEditing();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('does not suggest what is already on the list', () => {
    const { type, labels } = render(['Milk']);
    type('milk');
    expect(labels()).not.toContain('Add Milk');
    expect(labels()).toContain('Add Oat milk');
  });

  it('puts foods the person has added before first, and says so', () => {
    act(() => {
      useInventory.setState({
        items: [
          { id: '1', name: 'Oat milk', category: 'dairy', quantity: '1', location: 'fridge', addedOn: '2026-09-20', expiresOn: '2026-09-27', expirySource: 'estimate', status: 'used', resolvedOn: '2026-09-25' },
        ],
      });
    });
    const { tree, type, labels } = render();
    type('m');
    expect(labels()[0]).toBe('Add Oat milk');
    expect(byTestId(tree, 'suggestion-0').props.accessibilityHint).toBe('Added before · Keeps about 7 days');
  });

  it('points out foods that belong in the freezer', () => {
    const { tree, onAdd, type } = render();
    type('ice cr');
    expect(byTestId(tree, 'suggestion-0').props.accessibilityHint).toBe('Freezer · Keeps about 2 months');
    act(() => {
      byTestId(tree, 'suggestion-0').props.onPress();
    });
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ice cream', keptIn: 'freezer' }));
  });

  it('bolds the part of the name that matched', () => {
    const { tree, type } = render();
    type('milk');
    const row = byTestId(tree, 'suggestion-1');
    const bold = row.findAll((n) => n.props.variant === 'bodyStrong' && typeof n.props.children === 'string').map(textOf);
    expect(bold).toContain('"milk"');
  });
});

describe('adding to the list', () => {
  beforeEach(() => {
    act(() => {
      useScanDraft.getState().start('fridge', [], null, 'manual');
    });
  });

  it('puts new items at the top with an estimated date for where they are kept', () => {
    const s = useScanDraft.getState();
    act(() => {
      s.addManual('Milk', { category: 'dairy' });
      s.addManual('Ice cream', { category: 'dairy', keptIn: 'freezer' });
    });
    const [first, second] = useScanDraft.getState().drafts;
    expect(first).toMatchObject({ name: 'Ice cream', location: 'freezer', expirySource: 'estimate', selected: true });
    expect(second).toMatchObject({ name: 'Milk', location: 'fridge', category: 'dairy' });
  });

  it('flags an item that is already being tracked but keeps it selected', () => {
    act(() => {
      useInventory.setState({
        items: [{ id: '1', name: 'milk', category: 'dairy', quantity: '1', location: 'fridge', addedOn: '2026-09-20', expiresOn: '2026-09-27', expirySource: 'estimate', status: 'active' }],
      });
      useScanDraft.getState().addManual('Milk', { category: 'dairy' });
    });
    expect(useScanDraft.getState().drafts[0]).toMatchObject({ duplicate: true, selected: true });
  });

  it('re-estimates dates when the whole list moves, but leaves items kept elsewhere', () => {
    act(() => {
      useScanDraft.getState().addManual('Chicken breast', { category: 'meat' });
      useScanDraft.getState().addManual('Ice cream', { category: 'dairy', keptIn: 'freezer' });
    });
    const before = useScanDraft.getState().drafts;
    act(() => {
      useScanDraft.getState().setLocation('pantry');
    });
    const [ice, chicken] = useScanDraft.getState().drafts;
    expect(ice).toEqual(before[0]);
    expect(chicken.location).toBe('pantry');
    act(() => {
      useScanDraft.getState().setLocation('freezer');
    });
    const moved = useScanDraft.getState().drafts[1];
    expect(moved.location).toBe('freezer');
    // Chicken keeps months in the freezer, not the two days it has in the fridge.
    expect(moved.expiresOn > before[1].expiresOn).toBe(true);
  });
});
