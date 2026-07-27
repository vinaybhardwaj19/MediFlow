/**
 * @file provider.controller.js
 * @description Controller for querying nearby healthcare providers (hospitals, doctors, stores, labs).
 */

const Provider = require('../models/Provider.model');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/v1/providers/nearby
 * Query parameters: lat, lng, type, radius (in km, default 10)
 */
exports.getNearbyProviders = async (req, res) => {
  const { lat, lng, type, radius = 10 } = req.query;

  if (!lat || !lng) {
    throw ApiError.badRequest('Latitude and Longitude are required query parameters.');
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const radiusInMeters = parseFloat(radius) * 1000;

  if (isNaN(latitude) || isNaN(longitude)) {
    throw ApiError.badRequest('Invalid latitude or longitude format.');
  }

  const query = {
    'address.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude] // MongoDB expects [lng, lat]
        },
        $maxDistance: radiusInMeters
      }
    }
  };

  if (type) {
    query.type = type;
  }

  const providers = await Provider.find(query).limit(20);

  // Calculate distances manually to return in response
  const results = providers.map(p => {
    const pLng = p.address.coordinates.coordinates[0];
    const pLat = p.address.coordinates.coordinates[1];
    
    // Haversine formula
    const R = 6371; // Earth radius in km
    const dLat = (pLat - latitude) * Math.PI / 180;
    const dLon = (pLng - longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(latitude * Math.PI / 180) * Math.cos(pLat * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distanceKm = R * c;

    return {
      ...p.toObject(),
      distanceKm: parseFloat(distanceKm.toFixed(2))
    };
  });

  // Sort by distance
  results.sort((a, b) => a.distanceKm - b.distanceKm);

  return ApiResponse.ok(res, results, 'Nearby providers retrieved successfully.');
};

/**
 * POST /api/v1/providers
 * (Admin endpoint to seed/create providers)
 */
exports.createProvider = async (req, res) => {
  const { name, type, street, city, state, zip, coordinates, phone, rating, reviewsCount, consultationFee, details } = req.body;

  if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
    throw ApiError.badRequest('Coordinates must be an array of [longitude, latitude].');
  }

  const provider = await Provider.create({
    name,
    type,
    address: {
      street,
      city,
      state,
      zip,
      coordinates: {
        type: 'Point',
        coordinates
      }
    },
    phone,
    rating,
    reviewsCount,
    consultationFee,
    details
  });

  return ApiResponse.created(res, provider, 'Provider created successfully.');
};
