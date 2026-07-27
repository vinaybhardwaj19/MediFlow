#!/usr/bin/env bash
# deploy.sh — MediFlow Multi-Environment Docker Deployment Script

ENV=${1:-dev}

echo "Deploying MediFlow Enterprise in environment: $ENV"

if [ "$ENV" = "prod" ]; then
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
elif [ "$ENV" = "staging" ]; then
    docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build
else
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
fi

echo "Deployment finished for environment: $ENV"
