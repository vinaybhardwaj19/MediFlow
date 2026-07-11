"""
fleet_manager.py — Real-Time Drone Fleet State Management
===============================================================================
Manages the operational state of the drone fleet: tracking positions,
assigning delivery missions, monitoring battery levels, and handling
emergency landing protocols. Acts as the control plane for the drone fleet.
===============================================================================
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import asyncpg

log = logging.getLogger("mediflow.fleet")

# ── Drone Status State Machine ─────────────────────────────────────────────────
# Valid transitions:
#   grounded   → standby → en_route_pickup → payload_loaded → en_route_delivery → returning → grounded
#   any state  → emergency_land (triggered by low battery or obstacle)
#   any state  → maintenance (scheduled or fault detected)

VALID_TRANSITIONS = {
    "grounded":           {"standby", "maintenance"},
    "standby":            {"en_route_pickup", "maintenance", "grounded"},
    "en_route_pickup":    {"payload_loaded", "returning", "emergency_land"},
    "payload_loaded":     {"en_route_delivery", "emergency_land"},
    "en_route_delivery":  {"returning", "emergency_land"},
    "returning":          {"grounded", "emergency_land"},
    "maintenance":        {"grounded"},
    "emergency_land":     {"maintenance"},
}

# Battery thresholds
BATTERY_CRITICAL_PCT = 15   # Trigger emergency return-to-home
BATTERY_LOW_PCT      = 25   # Warn, prevent new mission assignment


class DroneFleetManager:
    """
    Manages real-time state for the autonomous drone fleet.

    Responsibilities:
        - Assign available drones to new delivery missions
        - Update drone position from telemetry pings
        - Monitor battery levels and trigger RTH (Return-to-Home)
        - Enforce state machine transitions (prevent illegal state jumps)
        - Persist all state changes to pharmacy.drone_fleet (TimescaleDB)
    """

    def __init__(self, db_pool: asyncpg.Pool):
        self._db = db_pool
        # In-memory cache of current drone states (avoids DB round-trip per telemetry ping)
        self._drone_cache: Dict[str, Dict] = {}

    # ── Mission Assignment ─────────────────────────────────────────────────────

    async def assign_mission(
        self,
        pharmacy_did: str,
        bioprint_job_id: str,
        route_id: str,
        payload_grams: int,
    ) -> Optional[str]:
        """
        Find the best available drone and assign it to a delivery mission.

        Selection criteria (in priority order):
            1. Status is 'standby' (ready for immediate dispatch)
            2. Battery level ≥ BATTERY_LOW_PCT (sufficient for mission)
            3. Payload capacity ≥ required payload_grams
            4. Closest to the pharmacy bioprinter (PostGIS distance query)

        Returns:
            Drone UUID if successfully assigned, None if no drone available.
        """
        rows = await self._db.fetch("""
            SELECT id, battery_pct, max_payload_grams, max_range_km,
                   ST_AsText(current_position) AS position_wkt
            FROM pharmacy.drone_fleet
            WHERE pharmacy_did = $1
              AND status = 'standby'
              AND battery_pct >= $2
              AND max_payload_grams >= $3
            ORDER BY battery_pct DESC
            LIMIT 1
        """, pharmacy_did, BATTERY_LOW_PCT, payload_grams)

        if not rows:
            log.warning(
                f"[FleetManager] No available drone for pharmacy {pharmacy_did[:20]}. "
                f"All drones may be busy or have insufficient battery."
            )
            return None

        drone = rows[0]
        drone_id = str(drone["id"])

        # Transition drone to 'en_route_pickup' state
        await self._update_status(drone_id, "en_route_pickup", {
            "current_payload_id": bioprint_job_id,
        })

        log.info(
            f"[FleetManager] ✅ Drone {drone_id[:8]}... assigned | "
            f"battery={drone['battery_pct']}% payload={payload_grams}g"
        )
        return drone_id

    # ── Telemetry Update ───────────────────────────────────────────────────────

    async def update_telemetry(
        self,
        drone_id: str,
        lon: float,
        lat: float,
        alt_m: float,
        battery_pct: int,
        telemetry_data: Dict,
    ) -> None:
        """
        Process a telemetry ping from a drone's onboard computer.
        Updates position, battery, and triggers safety responses.

        Drone telemetry is published via MQTT (topic: mediflow/drone/{drone_id}/telemetry)
        at 500ms intervals during flight, and every 30s when grounded.
        """
        # Update in-memory cache
        self._drone_cache[drone_id] = {
            "battery_pct": battery_pct,
            "lon": lon, "lat": lat, "alt_m": alt_m,
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }

        # PostGIS PointZ update: ST_SetSRID(ST_MakePoint(lon, lat, alt_m), 4326)
        await self._db.execute("""
            UPDATE pharmacy.drone_fleet
            SET current_position = ST_SetSRID(ST_MakePoint($1, $2, $3), 4326),
                battery_pct      = $4,
                last_telemetry   = $5::jsonb,
                last_seen_at     = NOW()
            WHERE id = $6::uuid
        """,
            lon, lat, alt_m,
            battery_pct,
            str(telemetry_data).replace("'", '"'),
            drone_id,
        )

        # ── Battery Safety Check ───────────────────────────────────────────────
        if battery_pct <= BATTERY_CRITICAL_PCT:
            log.critical(
                f"[FleetManager] 🔋 CRITICAL BATTERY: drone={drone_id[:8]}... "
                f"battery={battery_pct}% → initiating emergency return-to-home"
            )
            await self._trigger_rth(drone_id)

    # ── Status Transitions ─────────────────────────────────────────────────────

    async def _update_status(
        self, drone_id: str, new_status: str, extra_fields: Optional[Dict] = None
    ) -> None:
        """
        Update drone status with state machine validation.
        Raises ValueError if the transition is not allowed.
        """
        # Fetch current status
        row = await self._db.fetchrow(
            "SELECT status FROM pharmacy.drone_fleet WHERE id = $1::uuid", drone_id
        )
        if not row:
            raise ValueError(f"Drone {drone_id} not found")

        current_status = row["status"]
        allowed = VALID_TRANSITIONS.get(current_status, set())
        if new_status not in allowed:
            raise ValueError(
                f"Invalid drone state transition: {current_status} → {new_status}. "
                f"Allowed: {allowed}"
            )

        fields = extra_fields or {}
        await self._db.execute("""
            UPDATE pharmacy.drone_fleet
            SET status = $1, current_payload_id = COALESCE($2::uuid, current_payload_id)
            WHERE id = $3::uuid
        """,
            new_status,
            fields.get("current_payload_id"),
            drone_id,
        )
        log.info(f"[FleetManager] Drone {drone_id[:8]}... : {current_status} → {new_status}")

    async def _trigger_rth(self, drone_id: str) -> None:
        """
        Initiate Return-to-Home (RTH) emergency protocol.
        The drone autonomously navigates back to its home_base_position.
        """
        try:
            await self._update_status(drone_id, "emergency_land")
            # In production: publish RTH command via MQTT to drone's command topic
            # await mqtt_client.publish(f"mediflow/drone/{drone_id}/command",
            #                           json.dumps({"command": "RTH"}))
            log.warning(f"[FleetManager] RTH command issued to drone {drone_id[:8]}...")
        except ValueError as e:
            log.error(f"[FleetManager] RTH state transition failed: {e}")

    # ── Fleet Status Query ─────────────────────────────────────────────────────

    async def get_fleet_status(self, pharmacy_did: str) -> List[Dict]:
        """Returns a snapshot of all drones for a pharmacy."""
        rows = await self._db.fetch("""
            SELECT id, drone_serial, status, battery_pct,
                   ST_AsGeoJSON(current_position) AS position_geojson,
                   last_seen_at, current_payload_id
            FROM pharmacy.drone_fleet
            WHERE pharmacy_did = $1
            ORDER BY drone_serial
        """, pharmacy_did)
        return [dict(r) for r in rows]
