import { act, create } from 'react-test-renderer';
import { ErrorScreen } from '../src/components/ErrorScreen';

describe('ErrorScreen', () => {
  it('reassures the person and offers a retry that calls back', () => {
    const onRetry = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ErrorScreen onRetry={onRetry} />);
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Something went wrong');
    expect(text).toContain('Your items are safe on this device');

    const button = tree.root.findByProps({ accessibilityRole: 'button' });
    act(() => {
      button.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
