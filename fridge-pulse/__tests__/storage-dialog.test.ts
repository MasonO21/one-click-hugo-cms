import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDialog } from '../src/store/dialog';
import { safeStorage } from '../src/store/storage';

// babel-jest hoists this above the imports.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const storage = AsyncStorage as unknown as { getItem: jest.Mock; setItem: jest.Mock; removeItem: jest.Mock };

describe('safeStorage', () => {
  beforeEach(() => {
    storage.getItem.mockReset();
    storage.setItem.mockReset();
    storage.removeItem.mockReset();
  });

  it('passes through to AsyncStorage when it works', async () => {
    storage.getItem.mockResolvedValue('{"a":1}');
    expect(await safeStorage.getItem('k')).toBe('{"a":1}');
    await safeStorage.setItem('k', 'v');
    expect(storage.setItem).toHaveBeenCalledWith('k', 'v');
  });

  it('never rejects: a blocked store falls back to memory so hydration still finishes', async () => {
    storage.getItem.mockRejectedValue(new Error('SecurityError'));
    storage.setItem.mockRejectedValue(new Error('SecurityError'));
    storage.removeItem.mockRejectedValue(new Error('SecurityError'));

    expect(await safeStorage.getItem('blocked')).toBeNull();
    await expect(safeStorage.setItem('blocked', 'kept')).resolves.toBeUndefined();
    expect(await safeStorage.getItem('blocked')).toBe('kept');
    await expect(safeStorage.removeItem('blocked')).resolves.toBeUndefined();
    expect(await safeStorage.getItem('blocked')).toBeNull();
  });
});

describe('in-app dialog queue', () => {
  const req = (title: string) => ({ title, message: 'm', confirmLabel: 'OK', cancelLabel: 'Cancel', destructive: false });

  it('resolves true or false per answer and clears when done', async () => {
    const yes = useDialog.getState().ask(req('one'));
    expect(useDialog.getState().current?.title).toBe('one');
    useDialog.getState().answer(true);
    await expect(yes).resolves.toBe(true);
    expect(useDialog.getState().current).toBeNull();

    const no = useDialog.getState().ask(req('two'));
    useDialog.getState().answer(false);
    await expect(no).resolves.toBe(false);
  });

  it('shows dialogs one at a time, in order, without dropping any', async () => {
    const a = useDialog.getState().ask(req('a'));
    const b = useDialog.getState().ask(req('b'));
    const c = useDialog.getState().ask(req('c'));
    expect(useDialog.getState().current?.title).toBe('a');
    expect(useDialog.getState().queue.map((q) => q.title)).toEqual(['b', 'c']);

    useDialog.getState().answer(true);
    expect(useDialog.getState().current?.title).toBe('b');
    useDialog.getState().answer(false);
    expect(useDialog.getState().current?.title).toBe('c');
    useDialog.getState().answer(true);

    await expect(Promise.all([a, b, c])).resolves.toEqual([true, false, true]);
    expect(useDialog.getState().current).toBeNull();
  });

  it('ignores an answer when nothing is open', () => {
    expect(() => useDialog.getState().answer(true)).not.toThrow();
  });
});
