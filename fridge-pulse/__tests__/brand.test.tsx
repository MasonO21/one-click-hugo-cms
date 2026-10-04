import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Polyline } from 'react-native-svg';
import { Card } from '../src/components/Card';
import { FridgeMark, HEARTBEAT_POINTS } from '../src/components/Logo';
import { Text } from '../src/components/Text';
import { Wordmark } from '../src/components/Wordmark';
import { freshnessScore, freshnessWord } from '../src/lib/expiry';
import { useSettings } from '../src/store/settings';
import { BRAND, brandFont, darkPalette, FONT, glow, lightPalette, resolveScheme } from '../src/theme';
import { FONT_FILES, FONT_SOURCES } from '../src/theme/fontSources';

const counts = (expired: number, today: number, soon: number, week: number, ok: number) => ({
  total: expired + today + soon + week + ok,
  counts: { expired, today, soon, week, ok },
});

const flat = (node: ReactTestInstance) => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));

afterEach(() => {
  act(() => {
    useSettings.getState().set({ appearance: 'dark' });
  });
});

describe('the brand palette', () => {
  it('uses the colours from the brand sheet', () => {
    expect(BRAND).toMatchObject({ magenta: '#FF007F', blue: '#007FFF', orange: '#FF5F00', lime: '#A7F432', charcoal: '#222222' });
    // Charcoal Slate is the body text colour on light backgrounds.
    expect(lightPalette.ink).toBe(BRAND.charcoal);
    // Lime marks fresh food and good news in both looks.
    expect(darkPalette.success).toBe(BRAND.lime);
    expect(darkPalette.urgency.ok.solid).toBe(BRAND.lime);
  });

  it('defaults to the dark neon look, with light and "match phone" on request', () => {
    expect(useSettings.getState().appearance).toBe('dark');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('dark');
  });

  it('glows with an 8-digit colour', () => {
    expect(glow('#007FFF', 12, 0.5)).toEqual({ boxShadow: '0px 0px 12px #007FFF80' });
    expect(glow('#007FFF', 12, 2).boxShadow).toMatch(/FF$/);
  });
});

describe('typefaces', () => {
  it('maps weights to the bundled font files', () => {
    expect(brandFont('heading', '800')).toBe(FONT.headingBlack);
    expect(brandFont('heading', '600')).toBe(FONT.headingBold);
    expect(brandFont('body')).toBe(FONT.body);
    expect(brandFont('body', '600')).toBe(FONT.bodySemiBold);
    expect(brandFont('body', 'bold')).toBe(FONT.bodyBold);
    expect(brandFont('body', 900)).toBe(FONT.bodyBold);
    // Every family the app names is bundled, and the preview build can find each file.
    for (const name of Object.values(FONT)) {
      expect(FONT_SOURCES[name]).toBeDefined();
      expect(FONT_FILES[name]).toMatch(/^@expo-google-fonts\/.+\.ttf$/);
      expect(() => require.resolve(FONT_FILES[name])).not.toThrow();
    }
  });

  it('sets headlines in Montserrat and reading text in Open Sans, never with a synthetic weight', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <>
          <Text variant="title">Title</Text>
          <Text>Body</Text>
          <Text variant="caption" style={{ fontWeight: '700' }}>
            Bold caption
          </Text>
          <Text style={{ fontFamily: 'Custom' }}>Custom</Text>
        </>,
      );
    });
    const styles = tree.root.findAll((n) => (n.type as unknown) === 'Text' && typeof n.props.children === 'string').map(flat);
    expect(styles.map((s) => s.fontFamily)).toEqual([FONT.headingBlack, FONT.body, FONT.bodyBold, 'Custom']);
    for (const s of styles) expect(s.fontWeight).toBe('normal');
  });
});

describe('freshness score', () => {
  it('is the share of food with more than 3 days left', () => {
    expect(freshnessScore(counts(0, 0, 0, 0, 0))).toBeNull();
    expect(freshnessScore(counts(0, 0, 0, 0, 4))).toBe(100);
    expect(freshnessScore(counts(1, 1, 2, 1, 5))).toBe(60);
    expect(freshnessScore(counts(1, 1, 1, 0, 0))).toBe(0);
    expect(freshnessScore(counts(0, 0, 2, 0, 1))).toBe(33);
  });

  it('comes with a few words', () => {
    expect(freshnessWord(100)).toBe('Looking fresh');
    expect(freshnessWord(60)).toBe('Some need using');
    expect(freshnessWord(30)).toBe('Time to cook');
    expect(freshnessWord(0)).toBe('Use it or lose it');
  });
});

describe('brand components', () => {
  it('the wordmark reads "Fridge Pulse" in two colours, in either look', () => {
    for (const appearance of ['dark', 'light'] as const) {
      act(() => {
        useSettings.getState().set({ appearance });
      });
      const palette = appearance === 'dark' ? darkPalette : lightPalette;
      let tree!: ReturnType<typeof create>;
      act(() => {
        tree = create(<Wordmark size={30} />);
      });
      expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Fridge Pulse').length).toBeGreaterThan(0);
      const words = tree.root.findAll((n) => (n.type as unknown) === 'Text' && (n.props.children === 'Fridge' || n.props.children === 'Pulse'));
      expect(words.map((w) => flat(w).color)).toEqual([palette.wordFridge, palette.wordPulse]);
      // The neon halo is for the dark look only.
      expect(flat(words[0]!).textShadowRadius ?? 0).toBe(appearance === 'dark' ? 14 : 0);
    }
  });

  it('the mark draws the fridge and its heartbeat, with ids unique per drawing', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <>
          <FridgeMark size={40} />
          <FridgeMark size={40} />
        </>,
      );
    });
    const beats = tree.root.findAll((n) => n.type === Polyline && n.props.points === HEARTBEAT_POINTS);
    expect(beats.length).toBe(4);
    const ids = tree.root.findAll((n) => typeof n.props?.id === 'string' && n.props.id.startsWith('frame-') && typeof n.type !== 'string').map((n) => n.props.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('cards can glow blue or magenta', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <>
          <Card testID="plain" />
          <Card testID="blue" glow="blue" />
          <Card testID="magenta" glow="magenta" />
        </>,
      );
    });
    const style = (id: string) => flat(tree.root.findAll((n) => n.props?.testID === id && typeof n.type === 'string')[0]!);
    expect(style('plain').boxShadow).toBeUndefined();
    expect(style('plain').borderColor).toBe(darkPalette.border);
    expect(style('blue').boxShadow).toContain(darkPalette.glow);
    expect(style('magenta').boxShadow).toContain(darkPalette.primaryFill);
  });
});
