"""
test_kafka_bus.py — Unit Tests for Hardened Kafka Event Bus
Tests backpressure, DLQ fallback, health status, and reconnection logic.
"""

import sys
import asyncio
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "services" / "triage"))
import kafka_bus


class TestKafkaBusHealth(unittest.TestCase):
    """Test Kafka health reporting and metrics."""

    def test_health_returns_required_fields(self):
        """Health endpoint must report all required metrics."""
        health = kafka_bus.get_kafka_health()
        required = [
            "is_connected", "bootstrap_servers", "queue_depth",
            "max_queue_depth", "events_published", "events_failed",
            "reconnect_attempts", "backoff_sec"
        ]
        for field in required:
            self.assertIn(field, health, f"Missing field: {field}")

    def test_health_queue_depth_is_integer(self):
        """Queue depth must be a non-negative integer."""
        health = kafka_bus.get_kafka_health()
        self.assertIsInstance(health["queue_depth"], int)
        self.assertGreaterEqual(health["queue_depth"], 0)


class TestKafkaBusBackpressure(unittest.TestCase):
    """Test backpressure and DLQ fallback."""

    def test_publish_when_kafka_unavailable_uses_dlq(self):
        """When Kafka is down, events should go to DLQ and return True."""
        # Reset state
        kafka_bus._producer = None
        kafka_bus._is_connected = False
        kafka_bus._dlq_events.clear()
        kafka_bus._events_failed_count = 0

        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            kafka_bus.publish_kafka_event("test-topic", {"test": "data"})
        )
        loop.close()

        self.assertTrue(result, "Should return True (event queued to DLQ)")
        self.assertGreater(len(kafka_bus._dlq_events), 0, "DLQ should have the event")

    def test_event_structure_in_dlq(self):
        """DLQ events must have event_id, timestamp, topic, and data."""
        kafka_bus._dlq_events.clear()
        kafka_bus._producer = None
        kafka_bus._is_connected = False

        loop = asyncio.new_event_loop()
        loop.run_until_complete(
            kafka_bus.publish_kafka_event("vitals", {"hr": 85})
        )
        loop.close()

        event = kafka_bus._dlq_events[-1]
        self.assertIn("event_id", event)
        self.assertIn("timestamp", event)
        self.assertEqual(event["topic"], "vitals")
        self.assertEqual(event["data"]["hr"], 85)


if __name__ == '__main__':
    unittest.main()
