module mediflow-gateway

go 1.22

require (
	github.com/google/uuid v1.6.0
)

// NOTE FOR EXHIBITION SETUP:
// The Go API Gateway is a high-performance reverse proxy. It does NOT need
// liboqs installed — PQC operations are offloaded to the Python Identity Service.
// The gateway's role is to: (1) parse and forward the DID/VC token to the
// Identity Service for verification, (2) enforce RBAC claims extracted from
// the verified VC, and (3) apply rate limiting per DID identity.
//
// To run: go mod tidy && go run main.go
