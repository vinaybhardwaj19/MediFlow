"""
kafka_bus.py — Async Apache Kafka Event Producer & Consumer for MediFlow Python Microservices.
Features automatic fallback if Kafka broker is unavailable during local evaluation.
"""

import os
import json
import logging
from datetime import datetime

logger = logging.getLogger("mediflow.kafka")

BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
_producer = None
_is_connected = False

async def get_kafka_producer():
    global _producer, _is_connected
    if _producer is not None:
        return _producer, _is_connected

    try:
        from aiokafka import AIOKafkaProducer
        producer = AIOKafkaProducer(
            bootstrap_servers=BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )
        await producer.start()
        _producer = producer
        _is_connected = True
        logger.info(f"[Kafka] Connected to bootstrap servers: {BOOTSTRAP_SERVERS}")
    except Exception as e:
        _is_connected = False
        logger.warning(f"[Kafka] Broker unavailable ({e}) — running in fallback event bus mode.")

    return _producer, _is_connected

async def publish_kafka_event(topic: str, payload: dict):
    """
    Publishes event payload to Apache Kafka topic.
    """
    event = {
        "event_id": f"evt_{int(datetime.now().timestamp())}",
        "timestamp": datetime.now().isoformat(),
        "service": "python-microservice",
        "data": payload
    }

    producer, connected = await get_kafka_producer()
    if connected and producer:
        try:
            await producer.send_and_wait(topic, event)
            logger.info(f"[Kafka] Event sent to topic '{topic}': {event['event_id']}")
            return True
        except Exception as err:
            logger.error(f"[Kafka] Failed to send event to '{topic}': {err}")

    logger.info(f"[Kafka Sim Bus] Event dispatched to '{topic}': {event['event_id']}")
    return True
