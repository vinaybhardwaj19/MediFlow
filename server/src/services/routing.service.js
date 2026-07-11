/**
 * @file routing.service.js
 * @description Dijkstra-based optimal pharmacy delivery routing engine.
 *
 * Architecture:
 *   - Graph nodes  : Pharmacy locations (with lat/lng coordinates)
 *   - Edge weights : Composite cost = geodetic distance × traffic multiplier
 *                    ÷ stock availability factor
 *   - Algorithm    : Dijkstra's shortest path (min-heap via priority queue)
 *   - Output       : Ordered array of pharmacy IDs representing the optimal
 *                    delivery chain from source warehouse to patient
 *
 * Traffic simulation:
 *   Real deployments integrate Google Maps Distance Matrix API.
 *   For exhibition purposes, traffic is simulated using a time-of-day model:
 *     - Peak hours (7-9am, 5-7pm): ×2.0 multiplier
 *     - Off-peak : ×1.0
 *     - Night    : ×0.7 (faster delivery)
 *
 * Stock scoring:
 *   A pharmacy with low stock for requested medicines incurs a higher edge cost,
 *   causing the algorithm to prefer well-stocked warehouses.
 */

const logger = require('../utils/logger');

// ─── Priority Queue (min-heap) ─────────────────────────────────────────────────
/**
 * MinHeap for Dijkstra — stores { cost, nodeId } objects.
 * O(log n) push/pop.
 */
class MinHeap {
  constructor() { this._data = []; }

  push(item) {
    this._data.push(item);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    const top  = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() { return this._data.length; }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._data[parent].cost <= this._data[i].cost) break;
      [this._data[parent], this._data[i]] = [this._data[i], this._data[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._data[l].cost < this._data[smallest].cost) smallest = l;
      if (r < n && this._data[r].cost < this._data[smallest].cost) smallest = r;
      if (smallest === i) break;
      [this._data[smallest], this._data[i]] = [this._data[i], this._data[smallest]];
      i = smallest;
    }
  }
}

// ─── Geo utilities ─────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine formula — great-circle distance between two lat/lng points.
 * @param {{lat: number, lng: number}} a
 * @param {{lat: number, lng: number}} b
 * @returns {number} Distance in kilometres
 */
function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat  = toRad(b.lat - a.lat);
  const dLng  = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// ─── Traffic simulation ────────────────────────────────────────────────────────

/**
 * Returns a traffic multiplier based on the current hour (IST).
 * Peak hours (7-9, 17-19) → 2.0×, night (22-6) → 0.7×, else 1.0×
 */
function getTrafficMultiplier() {
  const hour = new Date().getHours(); // Local server time
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) return 2.0;  // Peak
  if (hour >= 22 || hour < 6)  return 0.7;  // Night — faster
  return 1.0;                                // Off-peak
}

// ─── Stock scoring ─────────────────────────────────────────────────────────────

/**
 * Calculates a stock penalty factor for a pharmacy given the requested medicines.
 * Returns a value in [1.0, 3.0] — higher penalty means less stock available.
 * @param {object[]} inventory  - Pharmacy inventory array
 * @param {string[]} medicineIds - Requested medicine IDs
 * @returns {number} Penalty multiplier
 */
function stockPenalty(inventory, medicineIds) {
  if (!medicineIds?.length) return 1.0;

  const inventoryMap = new Map(
    inventory.map((item) => [item.medicineId.toString(), item.stock])
  );

  let totalRequested = 0;
  let totalAvailable = 0;

  for (const id of medicineIds) {
    const stock = inventoryMap.get(id) ?? 0;
    totalRequested++;
    totalAvailable += stock > 0 ? 1 : 0;
  }

  const coverageRatio = totalAvailable / totalRequested; // 0..1
  // Low coverage → high penalty (up to 3×)
  return 1.0 + (1 - coverageRatio) * 2.0;
}

// ─── Graph construction ────────────────────────────────────────────────────────

/**
 * Builds an adjacency list from a flat array of pharmacy documents.
 * Each pharmacy is connected to every other pharmacy within MAX_EDGE_KM.
 * This is a dense graph (suitable for typical city-scale pharmacy networks).
 *
 * @param {object[]} pharmacies - Mongoose pharmacy documents
 * @param {string[]} medicineIds - For stock-aware edge weighting
 * @param {number}   [maxEdgeKm=50] - Maximum connection radius
 * @returns {Map<string, Array<{to: string, weight: number}>>}
 */
function buildGraph(pharmacies, medicineIds = [], maxEdgeKm = 50) {
  const traffic   = getTrafficMultiplier();
  const adjList   = new Map();

  // Initialise adjacency list
  for (const p of pharmacies) {
    adjList.set(p._id.toString(), []);
  }

  // Build edges — O(n²) acceptable for n < 1000 pharmacies
  for (let i = 0; i < pharmacies.length; i++) {
    for (let j = i + 1; j < pharmacies.length; j++) {
      const a = pharmacies[i];
      const b = pharmacies[j];

      const coordA = extractCoords(a);
      const coordB = extractCoords(b);
      if (!coordA || !coordB) continue;

      const distKm = haversineKm(coordA, coordB);
      if (distKm > maxEdgeKm) continue;   // Prune distant connections

      // Composite weight = distance × traffic × stock penalty (both directions differ if stock differs)
      const weightAtoB = distKm * traffic * stockPenalty(b.inventory, medicineIds);
      const weightBtoA = distKm * traffic * stockPenalty(a.inventory, medicineIds);

      adjList.get(a._id.toString()).push({ to: b._id.toString(), weight: weightAtoB });
      adjList.get(b._id.toString()).push({ to: a._id.toString(), weight: weightBtoA });
    }
  }

  return adjList;
}

/** Extract lat/lng from either embedded array [lng,lat] or flat {lat,lng} object */
function extractCoords(pharmacy) {
  const coords = pharmacy?.address?.coordinates;
  if (!coords) return null;
  // GeoJSON format: { type:'Point', coordinates:[lng, lat] }
  if (Array.isArray(coords.coordinates)) {
    return { lng: coords.coordinates[0], lat: coords.coordinates[1] };
  }
  // Flat format: { lat, lng }
  if (coords.lat !== undefined) return { lat: coords.lat, lng: coords.lng };
  return null;
}

// ─── Dijkstra ─────────────────────────────────────────────────────────────────

/**
 * Dijkstra's shortest path from sourceId to all reachable nodes.
 * @param {Map}    adjList  - Adjacency list from buildGraph()
 * @param {string} sourceId - Starting pharmacy ID
 * @returns {{ distances: Map<string, number>, previous: Map<string, string|null> }}
 */
function dijkstra(adjList, sourceId) {
  const distances = new Map();
  const previous  = new Map();
  const visited   = new Set();
  const heap      = new MinHeap();

  // Initialise
  for (const node of adjList.keys()) {
    distances.set(node, Infinity);
    previous.set(node, null);
  }
  distances.set(sourceId, 0);
  heap.push({ cost: 0, nodeId: sourceId });

  while (heap.size > 0) {
    const { cost, nodeId } = heap.pop();
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    for (const { to, weight } of (adjList.get(nodeId) || [])) {
      if (visited.has(to)) continue;
      const newCost = cost + weight;
      if (newCost < distances.get(to)) {
        distances.set(to, newCost);
        previous.set(to, nodeId);
        heap.push({ cost: newCost, nodeId: to });
      }
    }
  }

  return { distances, previous };
}

/**
 * Reconstructs the path from source to target using the `previous` map.
 * @param {Map}    previous
 * @param {string} targetId
 * @returns {string[]} Ordered array of node IDs (source → target)
 */
function reconstructPath(previous, targetId) {
  const path = [];
  let current = targetId;
  while (current !== null) {
    path.unshift(current);
    current = previous.get(current);
  }
  return path;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Calculate the optimal delivery route from a source pharmacy to the patient.
 *
 * @param {object} params
 * @param {object[]} params.pharmacies   - All active pharmacy documents from DB
 * @param {string}   params.sourceId     - Originating pharmacy _id (has the stock)
 * @param {string}   params.targetId     - Destination pharmacy nearest to patient
 *                                         (or same as sourceId for direct delivery)
 * @param {string[]} [params.medicineIds] - Requested medicine IDs (stock-aware weighting)
 * @returns {{
 *   path          : string[],   // Ordered pharmacy IDs
 *   totalCostKm   : number,     // Effective weighted distance
 *   trafficFactor : number,     // Traffic multiplier used
 *   estimatedMinutes: number,   // Rough delivery ETA (30 km/h avg)
 *   hops          : number,     // Number of intermediate stops
 * }}
 */
function calculateOptimalRoute({ pharmacies, sourceId, targetId, medicineIds = [] }) {
  if (!pharmacies?.length) {
    logger.warn('[RoutingService] No pharmacies provided — returning direct route');
    return { path: [sourceId], totalCostKm: 0, trafficFactor: 1, estimatedMinutes: 0, hops: 0 };
  }

  const adjList = buildGraph(pharmacies, medicineIds);

  // Validate source exists in graph
  if (!adjList.has(sourceId)) {
    throw new Error(`[RoutingService] sourceId "${sourceId}" not found in pharmacy graph`);
  }

  const { distances, previous } = dijkstra(adjList, sourceId);

  let path;
  let totalCost;

  if (sourceId === targetId) {
    // Direct delivery — no routing needed
    path      = [sourceId];
    totalCost = 0;
  } else if (!adjList.has(targetId) || distances.get(targetId) === Infinity) {
    // Target unreachable — fall back to nearest reachable pharmacy
    logger.warn(`[RoutingService] Target ${targetId} unreachable, finding nearest alternative`);
    let minDist = Infinity;
    let nearestId = sourceId;
    distances.forEach((d, id) => {
      if (id !== sourceId && d < minDist) { minDist = d; nearestId = id; }
    });
    path      = reconstructPath(previous, nearestId);
    totalCost = minDist;
  } else {
    path      = reconstructPath(previous, targetId);
    totalCost = distances.get(targetId);
  }

  const trafficFactor    = getTrafficMultiplier();
  const AVG_SPEED_KMH    = 30;
  // Unweight the cost back to raw km for ETA calculation
  const rawKm            = totalCost / trafficFactor;
  const estimatedMinutes = Math.round((rawKm / AVG_SPEED_KMH) * 60);

  logger.info(
    `[RoutingService] Route: ${path.join(' → ')} | ` +
    `cost=${totalCost.toFixed(2)} | traffic=${trafficFactor}× | ETA=${estimatedMinutes}min`
  );

  return {
    path,
    totalCostKm     : parseFloat(totalCost.toFixed(3)),
    trafficFactor,
    estimatedMinutes,
    hops            : path.length - 1,
  };
}

/**
 * Find the pharmacy nearest to a patient's coordinates that has stock for all items.
 * Used to auto-select the sourceId when the patient hasn't specified a pharmacy.
 *
 * @param {object[]} pharmacies
 * @param {{lat:number, lng:number}} patientCoords
 * @param {string[]} medicineIds
 * @returns {string|null} Best pharmacy _id or null
 */
function findBestSourcePharmacy(pharmacies, patientCoords, medicineIds = []) {
  let best     = null;
  let bestScore = Infinity;

  for (const pharmacy of pharmacies) {
    if (!pharmacy.isActive) continue;
    const coords = extractCoords(pharmacy);
    if (!coords) continue;

    const dist    = haversineKm(coords, patientCoords);
    if (dist > pharmacy.deliveryRadius) continue; // Outside delivery zone

    const penalty = stockPenalty(pharmacy.inventory, medicineIds);
    const score   = dist * penalty;  // Prefer close + well-stocked

    if (score < bestScore) {
      bestScore = score;
      best = pharmacy._id.toString();
    }
  }

  return best;
}

module.exports = { calculateOptimalRoute, findBestSourcePharmacy, haversineKm, getTrafficMultiplier };
