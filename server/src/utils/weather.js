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

/**
 * Fetch Air Quality Index (AQI) for coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object|null>} AQI data
 */
exports.fetchAQI = async (lat, lng) => {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lng}&appid=${apiKey}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const list = data.list?.[0] || {};
      const aqi = list.main?.aqi || 1; // 1=Good, 5=Poor

      const labels = { 1: 'Good', 2: 'Fair', 3: 'Moderate', 4: 'Poor', 5: 'Very Poor' };
      const colors = { 1: '#10b981', 2: '#eab308', 3: '#f97316', 4: '#ef4444', 5: '#991b1b' };

      return {
        index: aqi,
        label: labels[aqi] || 'Unknown',
        color: colors[aqi] || '#94a3b8',
        components: list.components || {}
      };
    }
  } catch (e) {
    console.warn('[AQI] Fetch failed:', e);
  }
  return null;
};
