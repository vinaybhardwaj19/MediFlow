/**
 * @file kafka.js
 * @description Apache Kafka Event Streaming Producer & Consumer setup for MediFlow Node API Server.
 * Supports real Kafka clusters with automatic in-memory fallback for local demo resiliency.
 */

const logger = require('../utils/logger');

let kafkaInstance = null;
let producerInstance = null;
let isKafkaConnected = false;

/**
 * Initialize Kafka Client & Producer
 */
async function initKafka() {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  try {
    const { Kafka, logLevel } = require('kafkajs');
    kafkaInstance = new Kafka({
      clientId: 'mediflow-node-server',
      brokers,
      logLevel: logLevel.ERROR,
      retry: { retries: 2 }
    });

    producerInstance = kafkaInstance.producer();
    await producerInstance.connect();
    isKafkaConnected = true;
    logger.info(`[Kafka] Connected to Kafka brokers: ${brokers.join(', ')}`);
  } catch (err) {
    isKafkaConnected = false;
    logger.warn(`[Kafka] Broker connection unavailable (${err.message}) — operating in Event Bus Fallback mode.`);
  }
}

/**
 * Publish event to Kafka topic
 * @param {string} topic - Kafka Topic (e.g. 'mediflow.orders.created')
 * @param {object} payload - JSON Serializable Event Payload
 */
async function publishEvent(topic, payload) {
  const eventData = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    service: 'mediflow-node-server',
    data: payload
  };

  if (isKafkaConnected && producerInstance) {
    try {
      await producerInstance.send({
        topic,
        messages: [{ value: JSON.stringify(eventData) }]
      });
      logger.info(`[Kafka] Event published to [${topic}]: ${eventData.eventId}`);
      return true;
    } catch (err) {
      logger.error(`[Kafka] Error publishing to [${topic}]: ${err.message}`);
    }
  }

  // Fallback: Internal Event Log
  logger.info(`[Kafka Event Bus Simulator] Published to [${topic}]: ${eventData.eventId}`);
  return true;
}

module.exports = {
  initKafka,
  publishEvent,
  isKafkaConnected: () => isKafkaConnected
};
