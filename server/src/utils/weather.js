/**
 * @file weather.js
 * @description Utility wrapper for fetching weather data from OpenWeatherMap.
 */

/**
 * Fetch current weather data for a city
 * @param {string} city - Name of the city
 * @returns {Promise<Object|null>} Weather data or null on failure
 */
exports.fetchWeather = async (city) => {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    console.warn('[Weather] API key is missing.');
    return null;
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
    const res = await fetch(url);
    
    if (res.ok) {
      const data = await res.json();
      return {
        temp: data.main.temp,
        feels_like: data.main.feels_like,
        description: data.weather[0]?.description || 'clear sky',
        humidity: data.main.humidity,
        wind_speed: data.wind?.speed || 0,
        city: data.name
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      console.error('[Weather] API error response:', res.status, errData);
      return null;
    }
  } catch (err) {
    console.error('[Weather] Network error fetching weather:', err);
    return null;
  }
};
