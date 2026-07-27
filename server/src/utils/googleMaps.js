/**
 * @file googleMaps.js
 * @description Google Maps Platform Integration (Directions & Distance Matrix API)
 * Calculates real-world road traffic ETAs and turn-by-turn route coordinates for delivery tracking.
 */

const logger = require('./logger');

/**
 * Calculates live road delivery route & ETA between origin & destination coordinates
 * @param {object} origin - { lat, lng }
 * @param {object} destination - { lat, lng }
 */
async function getGoogleMapsRoute(origin, destination) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    logger.info('[Google Maps] GOOGLE_MAPS_API_KEY missing — using simulated route telemetry.');
    return {
      distanceKm: 4.2,
      estimatedMinutes: 12,
      trafficDensity: 'MODERATE',
      polyline: [
        [origin.lat, origin.lng],
        [(origin.lat + destination.lat) / 2, (origin.lng + destination.lng) / 2],
        [destination.lat, destination.lng]
      ]
    };
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=driving&departure_time=now&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes?.[0];
    const leg = route?.legs?.[0];

    if (!leg) return null;

    return {
      distanceKm: (leg.distance.value / 1000).toFixed(1),
      estimatedMinutes: Math.ceil(leg.duration_in_traffic?.value / 60 || leg.duration.value / 60),
      trafficDensity: leg.duration_in_traffic?.value > leg.duration.value ? 'HEAVY' : 'NORMAL',
      overviewPolyline: route.overview_polyline?.points
    };
  } catch (err) {
    logger.error(`[Google Maps] Fetch exception: ${err.message}`);
    return null;
  }
}

module.exports = {
  getGoogleMapsRoute
};
