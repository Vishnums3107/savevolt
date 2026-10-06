import { WeatherData } from '../../types';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 8000;

interface GeocodePlace {
  name: string;
  latitude: number;
  longitude: number;
}

interface OpenMeteoCurrent {
  temperature_2m: number;
  relative_humidity_2m: number;
  weather_code: number;
}

const fetchWithTimeout = async (url: string): Promise<Response> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      fetch(url),
      new Promise<Response>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Weather request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`)),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getCondition = (weatherCode: number): string => {
  if (weatherCode === 0) return 'Clear';
  if ([1, 2].includes(weatherCode)) return 'Partly Cloudy';
  if (weatherCode === 3) return 'Cloudy';
  if ([45, 48].includes(weatherCode)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 'Snow';
  if ([95, 96, 99].includes(weatherCode)) return 'Thunderstorm';
  return 'Unknown';
};

export const fetchWeatherData = async (location: string): Promise<WeatherData> => {
  const safeLocation = location.trim() || 'New York';

  try {
    const geocodeResponse = await fetchWithTimeout(
      `${GEOCODING_URL}?name=${encodeURIComponent(safeLocation)}&count=1&language=en&format=json`,
    );
    if (!geocodeResponse.ok) throw new Error(`Geocoding request failed: ${geocodeResponse.status}`);

    const geocode = (await geocodeResponse.json()) as { results?: GeocodePlace[] };
    const place = geocode.results?.[0];
    if (!place) throw new Error('Location was not found');

    const forecastResponse = await fetchWithTimeout(
      `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`,
    );
    if (!forecastResponse.ok) throw new Error(`Weather request failed: ${forecastResponse.status}`);

    const forecast = (await forecastResponse.json()) as { current?: OpenMeteoCurrent };
    const current = forecast.current;
    if (!current) throw new Error('Current weather is unavailable');

    return {
      temperature: Math.round(current.temperature_2m),
      condition: getCondition(current.weather_code),
      humidity: Math.round(current.relative_humidity_2m),
      season: getSeason(new Date(), place.latitude),
      location: place.name,
      source: 'live',
    };
  } catch (error) {
    console.warn('Live weather unavailable; using a seasonal fallback.', error);
    return getFallbackWeatherData(safeLocation);
  }
};

export const getSeason = (
  date: Date,
  latitude: number = 40,
): 'spring' | 'summer' | 'fall' | 'winter' => {
  const month = (date.getMonth() + (latitude < 0 ? 6 : 0)) % 12;
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
};

export const getFallbackWeatherData = (location: string = 'New York'): WeatherData => {
  const season = getSeason(new Date());
  const temperature = season === 'summer' ? 30 : season === 'winter' ? 10 : 20;
  return {
    temperature,
    condition: season === 'summer' ? 'Clear' : season === 'winter' ? 'Cloudy' : 'Partly Cloudy',
    humidity: season === 'summer' ? 60 : 55,
    season,
    location,
    source: 'fallback',
  };
};

export const getMockWeatherData = getFallbackWeatherData;
