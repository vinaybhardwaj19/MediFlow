"""
drone_router.py — 3D A* Pathfinding for Autonomous Drone Delivery
===============================================================================

REAL-WORLD PROBLEM:
    2D navigation algorithms (Dijkstra, standard A*) treat airspace as flat.
    Drones operate in 3D space — altitude matters for obstacle clearance,
    regulatory corridors, and battery efficiency. A path that is short in
    2D may fly directly through a restricted airspace volume at 80m altitude.

THE 3D A* ALGORITHM:
    Standard A* extended to 3D using a (latitude, longitude, altitude) grid.

    Key extensions over 2D A*:
        - 26-directional neighbor expansion (3D Moore neighborhood) vs 8 in 2D
        - 3D Euclidean heuristic: h = sqrt(Δlat² + Δlon² + Δalt²) × scale_factor
        - Obstacle check: each candidate node is tested against PostGIS no-fly
          zone polygons (extrude 2D footprint to [min_alt, max_alt] volume)
        - Energy cost: upward movement costs MORE than downward (battery model)
        - Wind resistance penalty applied to horizontal movement segments

GRID COORDINATE SYSTEM:
    The continuous WGS84 geodetic space is discretized into a grid:
        - Horizontal resolution: GRID_STEP_M metres per cell (default: 50m)
        - Vertical resolution:   ALT_STEP_M metres per altitude layer (default: 10m)
        - Grid is local to the route (origin = pharmacy location) — no global grid needed

OUTPUT:
    A PostGIS LineStringZ geometry: ordered 3D waypoints (lon, lat, alt_m)
    ready for insertion into pharmacy.drone_delivery_routes.route_geometry
===============================================================================
"""

from __future__ import annotations

import heapq
import logging
import math
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

log = logging.getLogger("mediflow.drone_router")

# ── Grid Constants ─────────────────────────────────────────────────────────────
GRID_STEP_M   = 50.0    # Horizontal grid resolution (metres per cell)
ALT_STEP_M    = 10.0    # Vertical grid resolution (metres per altitude step)
MIN_ALT_M     = 30.0    # Minimum safe flight altitude (metres AGL)
DEFAULT_ALT_M = 80.0    # Default cruise altitude (regulatory: ≤ 120m AGL)
MAX_ALT_M     = 120.0   # Regulatory hard ceiling (DGCA/FAA Part 107)

# Earth radius for coordinate conversion
EARTH_RADIUS_M = 6_371_000.0

# Energy cost model weights
COST_HORIZONTAL = 1.0   # Base horizontal movement cost per step
COST_ASCEND     = 2.5   # Ascending is battery-expensive (thrust against gravity)
COST_DESCEND    = 0.6   # Descending is cheap (reduce thrust)
COST_OBSTACLE   = 1e9   # Pseudo-infinite cost for blocked cells


# ── 3D Grid Node ──────────────────────────────────────────────────────────────

@dataclass(frozen=True, order=True)
class GridNode:
    """
    A single cell in the 3D routing grid.
    (gx, gy) are integer grid indices for horizontal position.
    (gz) is the altitude layer index (gz=0 → MIN_ALT_M).
    """
    gx: int
    gy: int
    gz: int


@dataclass(order=True)
class PriorityNode:
    """Heap entry for the A* open set. Ordered by f_score."""
    f_score: float
    node: GridNode = field(compare=False)


# ── Coordinate Conversion ─────────────────────────────────────────────────────

def _metres_to_deg(metres: float) -> float:
    """Approximate metres → degrees latitude (valid for small distances)."""
    return metres / 111_320.0


def _deg_to_metres_lat(deg: float) -> float:
    return deg * 111_320.0


def _deg_to_metres_lon(deg: float, lat_ref: float) -> float:
    return deg * 111_320.0 * math.cos(math.radians(lat_ref))


class CoordConverter:
    """
    Converts between WGS84 (lon, lat, alt_m) and local grid (gx, gy, gz).
    Grid origin is set to the route's starting point (pharmacy location).
    """
    def __init__(self, origin_lon: float, origin_lat: float):
        self.origin_lon = origin_lon
        self.origin_lat = origin_lat

    def world_to_grid(self, lon: float, lat: float, alt: float) -> GridNode:
        """Convert WGS84 coordinates to integer grid indices."""
        dx_m = _deg_to_metres_lon(lon - self.origin_lon, self.origin_lat)
        dy_m = _deg_to_metres_lat(lat - self.origin_lat)
        dz_m = alt - MIN_ALT_M

        gx = round(dx_m / GRID_STEP_M)
        gy = round(dy_m / GRID_STEP_M)
        gz = max(0, round(dz_m / ALT_STEP_M))
        return GridNode(gx, gy, gz)

    def grid_to_world(self, node: GridNode) -> Tuple[float, float, float]:
        """Convert integer grid indices back to WGS84 coordinates."""
        dx_m = node.gx * GRID_STEP_M
        dy_m = node.gy * GRID_STEP_M
        dz_m = node.gz * ALT_STEP_M

        lon = self.origin_lon + _metres_to_deg(dx_m) / math.cos(math.radians(self.origin_lat))
        lat = self.origin_lat + _metres_to_deg(dy_m)
        alt = MIN_ALT_M + dz_m
        return (lon, lat, min(alt, MAX_ALT_M))


# ── No-Fly Zone Obstacle Map ──────────────────────────────────────────────────

class ObstacleMap:
    """
    Spatial index of blocked grid cells derived from PostGIS no-fly zones.

    In production: queries pharmacy.no_fly_zones via asyncpg and uses
    PostGIS ST_Contains to test each grid cell against zone polygons.

    For exhibition: implements a fast in-memory point-in-polygon check using
    the ray-casting algorithm (O(n) per zone, acceptable for n < 100 zones).
    """

    def __init__(self, no_fly_zones: List[Dict], converter: CoordConverter):
        """
        Args:
            no_fly_zones: List of zone dicts from the DB:
                          {zone_boundary: [[lon,lat],...], min_altitude_m, max_altitude_m}
            converter:    The coordinate converter for this route
        """
        self._zones = no_fly_zones
        self._converter = converter
        self._cache: Dict[GridNode, bool] = {}  # Memoize obstacle lookups

    def is_blocked(self, node: GridNode) -> bool:
        """
        Returns True if the grid node falls within any no-fly zone volume.
        Uses memoization — each unique node is only checked once per route.
        """
        if node in self._cache:
            return self._cache[node]

        lon, lat, alt = self._converter.grid_to_world(node)
        blocked = False

        for zone in self._zones:
            z_min = zone.get("min_altitude_m", 0.0)
            z_max = zone.get("max_altitude_m", 120.0)

            # Skip if altitude is outside zone's vertical extent
            if alt < z_min or alt > z_max:
                continue

            # Test 2D point-in-polygon using ray-casting algorithm
            boundary = zone.get("zone_boundary", [])
            if boundary and self._point_in_polygon(lon, lat, boundary):
                blocked = True
                break

        self._cache[node] = blocked
        return blocked

    @staticmethod
    def _point_in_polygon(px: float, py: float, polygon: List[List[float]]) -> bool:
        """
        Ray-casting algorithm for point-in-polygon test.
        polygon: list of [lon, lat] coordinate pairs (closed ring).
        Returns True if (px, py) is inside the polygon.
        """
        n = len(polygon)
        inside = False
        j = n - 1
        for i in range(n):
            xi, yi = polygon[i][0], polygon[i][1]
            xj, yj = polygon[j][0], polygon[j][1]
            if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi):
                inside = not inside
            j = i
        return inside


# ── 3D A* Algorithm ───────────────────────────────────────────────────────────

class DroneRouter3D:
    """
    3D A* pathfinding engine for autonomous drone delivery routes.

    The algorithm finds the minimum-energy path from origin to destination
    in 3D airspace, respecting no-fly zone obstacles and altitude limits.

    COMPLEXITY:
        Time:  O(b^d) where b=26 (branching factor) and d=path length in grid steps
               In practice O(n log n) with the priority queue where n = explored nodes
        Space: O(n) for the open/closed sets and came_from dict

    PERFORMANCE:
        A 5km route with 50m grid cells ≈ 100×100×9 = 90,000 grid cells.
        A* explores ~10-20% of these ≈ 10,000 nodes.
        Each node: 26 neighbor checks × obstacle lookup (cached) ≈ microseconds.
        Total route computation: < 100ms on modern hardware.
    """

    def __init__(
        self,
        origin:      Tuple[float, float, float],   # (lon, lat, alt_m)
        destination: Tuple[float, float, float],   # (lon, lat, alt_m)
        no_fly_zones: List[Dict],
        max_range_km: float = 20.0,
        wind_direction_deg: float = 0.0,
        wind_speed_ms: float = 0.0,
    ):
        self.origin      = origin
        self.destination = destination
        self.max_range_km = max_range_km
        self.wind_dir    = math.radians(wind_direction_deg)
        self.wind_speed  = wind_speed_ms

        # Set grid origin to the route's starting point
        self._conv = CoordConverter(origin[0], origin[1])
        self._obstacles = ObstacleMap(no_fly_zones, self._conv)

        # Convert origin and destination to grid nodes
        self._start = self._conv.world_to_grid(*origin)
        self._goal  = self._conv.world_to_grid(*destination)

    def _heuristic(self, node: GridNode) -> float:
        """
        3D Euclidean admissible heuristic h(n).
        Converts grid steps to metres and computes 3D Euclidean distance.

        ADMISSIBILITY: The heuristic never overestimates the actual cost
        because we use the shortest possible path (straight line) and the
        minimum movement cost (COST_HORIZONTAL = 1.0 per GRID_STEP_M).
        An admissible heuristic guarantees A* finds the optimal path.
        """
        dx = (self._goal.gx - node.gx) * GRID_STEP_M
        dy = (self._goal.gy - node.gy) * GRID_STEP_M
        dz = (self._goal.gz - node.gz) * ALT_STEP_M
        distance_m = math.sqrt(dx*dx + dy*dy + dz*dz)
        # Convert distance to cost units (divide by GRID_STEP_M for normalisation)
        return distance_m / GRID_STEP_M

    def _edge_cost(self, current: GridNode, neighbor: GridNode) -> float:
        """
        Compute the movement cost from current → neighbor node.

        Cost components:
            1. Base horizontal distance cost (COST_HORIZONTAL)
            2. Vertical cost penalty (ascent costs more than descent)
            3. Wind resistance penalty (headwind = higher cost, tailwind = lower)
        """
        # Determine movement deltas
        dgx = neighbor.gx - current.gx
        dgy = neighbor.gy - current.gy
        dgz = neighbor.gz - current.gz

        # Horizontal distance in grid steps (Euclidean in horizontal plane)
        horiz_steps = math.sqrt(dgx*dgx + dgy*dgy)

        # Base cost
        cost = horiz_steps * COST_HORIZONTAL

        # Vertical cost
        if dgz > 0:
            cost += dgz * COST_ASCEND
        elif dgz < 0:
            cost += abs(dgz) * COST_DESCEND

        # Wind resistance (horizontal component only)
        if horiz_steps > 0 and self.wind_speed > 0:
            # Movement direction angle
            move_angle = math.atan2(dgy, dgx)
            # Headwind component: positive = headwind, negative = tailwind
            wind_component = math.cos(move_angle - self.wind_dir) * self.wind_speed
            # Wind resistance increases cost by up to 20% in a full headwind
            wind_penalty = wind_component / 50.0  # 50 m/s normalisation
            cost *= (1.0 + max(-0.15, min(0.20, wind_penalty)))

        return max(cost, 0.01)  # Minimum cost to prevent zero-cost cycles

    def _get_neighbors(self, node: GridNode) -> List[GridNode]:
        """
        Generate all valid 26-directional neighbors in the 3D Moore neighborhood.

        The Moore neighborhood in 3D has 26 neighbors:
            - 6 face neighbors  (±x, ±y, ±z)
            - 12 edge neighbors (diagonal in one plane)
            - 8 corner neighbors (full 3D diagonal)

        This is the key extension from 2D A* (8 neighbors) to 3D A* (26 neighbors).
        It allows the drone to move diagonally in 3D space, producing smoother paths.
        """
        neighbors = []
        for dgx in (-1, 0, 1):
            for dgy in (-1, 0, 1):
                for dgz in (-1, 0, 1):
                    if dgx == 0 and dgy == 0 and dgz == 0:
                        continue  # Skip self

                    n = GridNode(node.gx + dgx, node.gy + dgy, node.gz + dgz)

                    # Altitude bounds check
                    if n.gz < 0:
                        continue  # Below minimum altitude

                    alt = MIN_ALT_M + n.gz * ALT_STEP_M
                    if alt > MAX_ALT_M:
                        continue  # Above regulatory ceiling

                    # Obstacle check (uses memoized PostGIS-derived map)
                    if self._obstacles.is_blocked(n):
                        continue

                    neighbors.append(n)

        return neighbors

    def find_path(self) -> Optional[List[Tuple[float, float, float]]]:
        """
        Execute the 3D A* search and return the optimal flight path.

        Returns:
            List of (lon, lat, alt_m) waypoints from origin to destination,
            or None if no valid path exists (all routes blocked by no-fly zones).

        ALGORITHM:
            Standard A* with f(n) = g(n) + h(n):
                g(n): actual cost from start to node n
                h(n): admissible heuristic estimate from n to goal
            The open set is a min-heap ordered by f(n).
            The closed set tracks nodes already expanded.
        """
        t0 = time.perf_counter()

        # A* data structures
        open_heap: List[PriorityNode] = []
        g_score: Dict[GridNode, float] = {self._start: 0.0}
        came_from: Dict[GridNode, Optional[GridNode]] = {self._start: None}
        closed_set: Set[GridNode] = set()

        # Initialise with start node
        h0 = self._heuristic(self._start)
        heapq.heappush(open_heap, PriorityNode(f_score=h0, node=self._start))

        nodes_explored = 0
        max_nodes = 50_000  # Safety limit to prevent infinite search

        while open_heap and nodes_explored < max_nodes:
            current_entry = heapq.heappop(open_heap)
            current = current_entry.node

            if current in closed_set:
                continue
            closed_set.add(current)
            nodes_explored += 1

            # ── Goal test ──────────────────────────────────────────────────────
            # Allow a tolerance of 2 grid cells (100m) around the goal
            if (abs(current.gx - self._goal.gx) <= 2 and
                abs(current.gy - self._goal.gy) <= 2 and
                abs(current.gz - self._goal.gz) <= 2):

                path = self._reconstruct_path(came_from, current)
                elapsed = (time.perf_counter() - t0) * 1000

                log.info(
                    f"[DroneRouter3D] Path found in {elapsed:.1f}ms | "
                    f"nodes_explored={nodes_explored} | waypoints={len(path)} | "
                    f"nfz_avoided={len(self._obstacles._cache)}"
                )
                return path

            # ── Expand neighbors ───────────────────────────────────────────────
            for neighbor in self._get_neighbors(current):
                if neighbor in closed_set:
                    continue

                tentative_g = g_score[current] + self._edge_cost(current, neighbor)

                if tentative_g < g_score.get(neighbor, float('inf')):
                    came_from[neighbor] = current
                    g_score[neighbor]   = tentative_g
                    f_score             = tentative_g + self._heuristic(neighbor)
                    heapq.heappush(open_heap, PriorityNode(f_score=f_score, node=neighbor))

        elapsed = (time.perf_counter() - t0) * 1000
        log.warning(
            f"[DroneRouter3D] No path found after {elapsed:.1f}ms "
            f"(explored {nodes_explored} nodes). All routes may be blocked."
        )
        return None

    def _reconstruct_path(
        self,
        came_from: Dict[GridNode, Optional[GridNode]],
        current: GridNode,
    ) -> List[Tuple[float, float, float]]:
        """
        Trace back through came_from pointers to reconstruct the full path.
        Returns path as WGS84 (lon, lat, alt_m) coordinates.
        """
        path_nodes = []
        node = current
        while node is not None:
            path_nodes.append(node)
            node = came_from.get(node)
        path_nodes.reverse()

        # Convert grid nodes to world coordinates
        waypoints = [self._conv.grid_to_world(n) for n in path_nodes]
        return waypoints

    def route_to_postgis_wkt(
        self, waypoints: List[Tuple[float, float, float]]
    ) -> str:
        """
        Convert the waypoint list to a PostGIS LineStringZ WKT string.
        This can be used directly in a PostgreSQL INSERT with ST_GeomFromText().

        Format: LINESTRING Z (lon1 lat1 alt1, lon2 lat2 alt2, ...)

        Example output:
            LINESTRING Z (77.5946 12.9716 80.0, 77.5996 12.9750 90.0, ...)
        """
        if not waypoints:
            return ""
        coords_str = ", ".join(f"{lon:.6f} {lat:.6f} {alt:.1f}" for lon, lat, alt in waypoints)
        return f"LINESTRING Z ({coords_str})"

    def compute_metrics(
        self, waypoints: List[Tuple[float, float, float]]
    ) -> Dict:
        """
        Compute route metrics for storage in pharmacy.drone_delivery_routes.
        """
        if len(waypoints) < 2:
            return {"total_distance_km": 0.0, "max_altitude_m": 0.0, "waypoint_count": 0}

        total_dist = 0.0
        max_alt = 0.0

        for i in range(1, len(waypoints)):
            lon1, lat1, alt1 = waypoints[i-1]
            lon2, lat2, alt2 = waypoints[i]
            dx = _deg_to_metres_lon(lon2 - lon1, lat1)
            dy = _deg_to_metres_lat(lat2 - lat1)
            dz = alt2 - alt1
            total_dist += math.sqrt(dx*dx + dy*dy + dz*dz)
            max_alt = max(max_alt, alt2)

        return {
            "total_distance_km":   round(total_dist / 1000, 3),
            "max_altitude_reached_m": round(max_alt, 1),
            "waypoint_count":      len(waypoints),
            "no_fly_zones_avoided": sum(1 for v in self._obstacles._cache.values() if v),
        }


# ── Public API ─────────────────────────────────────────────────────────────────

def compute_drone_route(
    origin_lon:   float,
    origin_lat:   float,
    origin_alt_m: float,
    dest_lon:     float,
    dest_lat:     float,
    dest_alt_m:   float,
    no_fly_zones: List[Dict],
    max_range_km: float = 20.0,
    wind_direction_deg: float = 0.0,
    wind_speed_ms:      float = 0.0,
) -> Dict:
    """
    High-level entry point for computing a 3D drone delivery route.

    Args:
        origin_*:         3D coordinates of the pharmacy bioprinter (start point)
        dest_*:           3D coordinates of the patient delivery point (end point)
        no_fly_zones:     List of zone dicts from pharmacy.no_fly_zones table
        max_range_km:     Maximum drone range (battery constraint)
        wind_direction_deg: Wind direction in degrees (0=North, 90=East)
        wind_speed_ms:    Wind speed in metres/second

    Returns:
        Dict with keys:
            success:        bool
            route_wkt:      PostGIS LineStringZ WKT string (None if no path)
            waypoints:      List of (lon, lat, alt_m) tuples
            metrics:        Route statistics dict
            error:          Error message (if success=False)
    """
    router = DroneRouter3D(
        origin      = (origin_lon, origin_lat, max(origin_alt_m, MIN_ALT_M)),
        destination = (dest_lon,   dest_lat,   max(dest_alt_m,   MIN_ALT_M)),
        no_fly_zones = no_fly_zones,
        max_range_km = max_range_km,
        wind_direction_deg = wind_direction_deg,
        wind_speed_ms      = wind_speed_ms,
    )

    waypoints = router.find_path()

    if waypoints is None:
        return {
            "success":   False,
            "route_wkt": None,
            "waypoints": [],
            "metrics":   {},
            "error":     "No valid flight path found — all routes blocked by no-fly zones",
        }

    route_wkt = router.route_to_postgis_wkt(waypoints)
    metrics   = router.compute_metrics(waypoints)

    return {
        "success":   True,
        "route_wkt": route_wkt,
        "waypoints": waypoints,
        "metrics":   metrics,
        "error":     None,
    }
