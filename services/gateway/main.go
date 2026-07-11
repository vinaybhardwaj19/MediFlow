/*
 * main.go — MediFlow 2036 API Gateway
 * ============================================================================
 *
 * ROLE IN THE 2036 ARCHITECTURE:
 *   This is the single ingress point for ALL client traffic. Written in Go for
 *   sub-millisecond overhead on the authentication hot-path. It is intentionally
 *   thin — it authenticates, authorises, rate-limits, and proxies. All business
 *   logic lives in the downstream microservices.
 *
 * FUTURISTIC MECHANICS:
 *   1. PQC-AWARE TLS: In production, the TLS termination layer uses a hybrid
 *      key exchange (X25519 + Kyber-768), so the TLS handshake itself is
 *      quantum-resistant. This is handled by the reverse proxy/load balancer
 *      (e.g., Envoy with OQS-OpenSSL) in front of this service.
 *
 *   2. DID AUTHENTICATION: Instead of checking a JWT against a shared secret,
 *      the gateway forwards the Authorization header (which carries a W3C
 *      Verifiable Presentation) to the Identity Service for cryptographic
 *      verification. Only the Identity Service touches private key material.
 *
 *   3. CLAIMS INJECTION: After VC verification, the Identity Service returns
 *      the extracted claims (DID, role, permissions). The gateway injects these
 *      as X-MediFlow-* headers for the downstream microservice to consume
 *      without re-authenticating — zero-trust propagation.
 *
 * STARTUP: go run main.go
 *          PORT env var controls listen address (default: 8080)
 * ============================================================================
 */

package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// ── Configuration ─────────────────────────────────────────────────────────────

// GatewayConfig holds all runtime configuration, sourced exclusively from
// environment variables. No config files — immutable infra principle.
type GatewayConfig struct {
	Port               string // Gateway listen port
	IdentityServiceURL string // Internal URL of the Identity microservice
	TriageServiceURL   string // Internal URL of the Triage microservice
	ConsultServiceURL  string // Internal URL of the Consultation microservice
	PharmacyServiceURL string // Internal URL of the Pharmacy microservice
	RecordsServiceURL  string // Internal URL of the Records microservice
	NotifyServiceURL   string // Internal URL of the Notification microservice
	LegacyNodeURL      string // Internal URL of existing Node.js backend (bridge)
	LogLevel           string // Logging verbosity: debug | info | warn | error
}

// loadConfig reads environment variables with production-safe defaults.
// In Kubernetes, these are injected via ConfigMap and Secret volumes.
func loadConfig() *GatewayConfig {
	return &GatewayConfig{
		Port:               getEnv("GATEWAY_PORT", "8080"),
		IdentityServiceURL: getEnv("IDENTITY_SERVICE_URL", "http://identity:8001"),
		TriageServiceURL:   getEnv("TRIAGE_SERVICE_URL", "http://triage:8002"),
		ConsultServiceURL:  getEnv("CONSULT_SERVICE_URL", "http://consultation:8003"),
		PharmacyServiceURL: getEnv("PHARMACY_SERVICE_URL", "http://pharmacy:8004"),
		RecordsServiceURL:  getEnv("RECORDS_SERVICE_URL", "http://records:8005"),
		NotifyServiceURL:   getEnv("NOTIFY_SERVICE_URL", "http://notifications:8006"),
		LegacyNodeURL:      getEnv("LEGACY_NODE_URL", "http://localhost:5000"),
		LogLevel:           getEnv("LOG_LEVEL", "info"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	// ── Structured Logging Setup ───────────────────────────────────────────────
	// Using Go 1.21+ structured logging (slog) for JSON output in production.
	// JSON logs are ingested by the observability stack (Loki/Elasticsearch).
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("MediFlow 2036 API Gateway starting",
		"version", "2036.2.0",
		"security_model", "Post-Quantum DID/VC",
	)

	// ── Load Configuration ─────────────────────────────────────────────────────
	cfg := loadConfig()

	// ── Build Middleware Chain ─────────────────────────────────────────────────
	// Middleware execution order (outermost → innermost):
	//   RequestID → RateLimiter → PQCDecrypt → DIDAuth → RequestProxy
	//
	// This order is critical:
	//   1. RequestID first: every log line gets a correlation ID
	//   2. RateLimiter before auth: prevents DoS on the identity service itself
	//   3. PQCDecrypt before auth: decrypt the request body so auth can read the VC
	//   4. DIDAuth last: verify the decrypted credential and inject claims

	rateLimiter := NewRateLimiter(
		100,           // Max 100 requests per window per DID/IP
		time.Minute,   // 1-minute sliding window
	)

	didAuthMiddleware := NewDIDAuthMiddleware(cfg.IdentityServiceURL, logger)
	pqcMiddleware := NewPQCMiddleware(logger)

	// ── Route Table ───────────────────────────────────────────────────────────
	mux := BuildRoutes(cfg, didAuthMiddleware, pqcMiddleware, rateLimiter, logger)

	// ── HTTP Server ───────────────────────────────────────────────────────────
	// ReadTimeout / WriteTimeout are set conservatively for a gateway that
	// streams WebRTC signalling data (longer-lived connections).
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second, // 60s for WebXR session establishment
		IdleTimeout:  120 * time.Second,
	}

	// ── Graceful Shutdown ─────────────────────────────────────────────────────
	// Listen for SIGTERM (Kubernetes pod termination) and SIGINT (Ctrl+C).
	// Give in-flight requests 15 seconds to complete before hard shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		slog.Info("Gateway listening", "addr", fmt.Sprintf(":%s", cfg.Port))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Gateway failed to start", "error", err)
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("Shutdown signal received — draining connections (15s timeout)")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		slog.Error("Forced shutdown", "error", err)
	}
	slog.Info("Gateway shutdown complete")
}
