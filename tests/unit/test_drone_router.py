"""
test_drone_router.py — Unit Tests for 3D A* Drone Delivery Pathfinding
"""

import sys
from pathlib import Path

# Add services/pharmacy to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "services" / "pharmacy"))
import drone_router

def test_drone_router_initialization():
    origin = (77.5946, 12.9716, 0.0)
    destination = (77.6000, 12.9780, 0.0)
    no_fly_zones = []

    router = drone_router.DroneRouter3D(origin, destination, no_fly_zones)
    assert router is not None
    assert router.origin == origin
    assert router.destination == destination

def test_3d_pathfinding_route_generation():
    origin = (77.5946, 12.9716, 0.0)
    destination = (77.6000, 12.9780, 0.0)
    no_fly_zones = []

    router = drone_router.DroneRouter3D(origin, destination, no_fly_zones)
    waypoints = router.find_path()

    assert waypoints is not None
    assert len(waypoints) >= 2
