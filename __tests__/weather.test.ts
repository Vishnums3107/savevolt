import { fetchWeatherData, getSeason } from '../src/services/api/weatherApi';

describe('weather utilities', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the live Open-Meteo responses when the location resolves', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ name: 'Bengaluru', latitude: 12.97, longitude: 77.59 }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ current: { temperature_2m: 27.6, relative_humidity_2m: 64.2, weather_code: 2 } }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchWeatherData('Bengaluru')).resolves.toEqual({
      temperature: 28,
      humidity: 64,
      condition: 'Partly Cloudy',
      season: getSeason(new Date(), 12.97),
      location: 'Bengaluru',
      source: 'live',
    });
  });

  it('returns a clearly labelled seasonal fallback when live weather is unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await fetchWeatherData('Pune');

    expect(result.location).toBe('Pune');
    expect(result.source).toBe('fallback');
  });

  it('uses the opposite season in the southern hemisphere', () => {
    expect(getSeason(new Date('2026-01-15T12:00:00Z'), -33.87)).toBe('summer');
  });
});
