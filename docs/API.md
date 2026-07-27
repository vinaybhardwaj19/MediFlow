# API Documentation

Base URL: `/api/v1`

## Authentication Endpoints
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh-token`
- `POST /auth/logout`

## Patient Endpoints
- `GET /patients`
- `POST /patients`
- `PUT /patients/:id`

## Appointment Endpoints
- `GET /appointments`
- `POST /appointments`
- `PUT /appointments/:id`
- `DELETE /appointments/:id`

## Triage Endpoints
- `POST /triage/assess`

## Pharmacy Endpoints
- `GET /pharmacy/orders`
- `POST /pharmacy/orders`
- `PUT /pharmacy/orders/:id`

## Prescription Endpoints
- `GET /prescriptions`
- `POST /prescriptions`

## Rider Endpoints
- `GET /rider`
- `POST /rider`
- `PUT /rider/:id`

## Payment Endpoints
- `POST /payment/create`
- `POST /payment/verify`

## ML Endpoints
- `POST /ml/predict`
- `GET /ml/health`
- `POST /ml/ddi/check`

## Examples
### Register
```json
// POST /auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123"
}
```
