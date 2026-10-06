import { Colors, themed, ThemeColors } from '../src/theme';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const CHANNEL = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|\\d?\\d)';
const ALPHA = '(?:0|1|0?\\.\\d+|1\\.0+)';
const RGB = new RegExp(`^rgb\\(\\s*${CHANNEL}\\s*,\\s*${CHANNEL}\\s*,\\s*${CHANNEL}\\s*\\)$`);
const RGBA = new RegExp(`^rgba\\(\\s*${CHANNEL}\\s*,\\s*${CHANNEL}\\s*,\\s*${CHANNEL}\\s*,\\s*${ALPHA}\\s*\\)$`);

const isColor = (value: string) => HEX.test(value) || RGB.test(value) || RGBA.test(value);

/** Every color string in a palette, with a readable path for failure messages. */
const colorEntries = (palette: ThemeColors): [string, string][] =>
  Object.entries(palette).flatMap(([key, value]) =>
    Array.isArray(value)
      ? value.map((item, index): [string, string] => [`${key}[${index}]`, item])
      : [[key, value as string]],
  );

const light = themed(false);
const dark = themed(true);

describe('theme palettes', () => {
  it('returns the light palette for light mode and keeps Colors as the light palette', () => {
    expect(light).toBe(Colors);
    expect(dark).not.toBe(light);
  });

  it('expose identical token names in light and dark', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('use the same value shape for every token', () => {
    for (const key of Object.keys(light) as (keyof ThemeColors)[]) {
      expect([key, Array.isArray(dark[key])]).toEqual([key, Array.isArray(light[key])]);
      expect([key, typeof dark[key]]).toEqual([key, typeof light[key]]);
    }
  });

  it('have chart series of the same length in both modes', () => {
    expect(light.chart.length).toBeGreaterThanOrEqual(6);
    expect(dark.chart).toHaveLength(light.chart.length);
  });

  it('use distinct colors within each chart series', () => {
    expect(new Set(light.chart.map((c) => c.toLowerCase())).size).toBe(light.chart.length);
    expect(new Set(dark.chart.map((c) => c.toLowerCase())).size).toBe(dark.chart.length);
  });

  it('have a three-stop hero gradient in both modes', () => {
    expect(light.heroGradient).toHaveLength(3);
    expect(dark.heroGradient).toHaveLength(3);
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ])('contain only valid hex or rgb(a) color strings (%s)', (_mode, palette) => {
    const invalid = colorEntries(palette).filter(([, value]) => typeof value !== 'string' || !isColor(value));
    expect(invalid).toEqual([]);
  });

  it('switch surfaces and text between modes', () => {
    expect(dark.background).not.toBe(light.background);
    expect(dark.card).not.toBe(light.card);
    expect(dark.text).not.toBe(light.text);
  });

  it('keep text on the dark hero light in both modes', () => {
    expect(light.textOnDark).toBe(dark.textOnDark);
  });
});

describe('color validator', () => {
  it.each(['#fff', '#FFFFFF', '#0B1120', '#00000080', 'rgba(255,255,255,0.7)', 'rgba(0, 0, 0, 1)', 'rgb(12,34,56)'])(
    'accepts %p',
    (value) => {
      expect(isColor(value)).toBe(true);
    },
  );

  it.each(['fff', '#ggg', '#12345', 'rgba(256,0,0,1)', 'rgba(0,0,0,1.5)', 'red', '', 'rgba(0,0,0)'])(
    'rejects %p',
    (value) => {
      expect(isColor(value)).toBe(false);
    },
  );
});
