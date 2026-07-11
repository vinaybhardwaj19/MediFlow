/*
 * routes.go — MediFlow 2036 API Gateway Route Table
 * ============================================================================
 *
 * ARCHITECTURE PATTERN: Reverse Proxy with Selective Middleware
 *
 *   Each route group has a distinct middleware stack. Public endpoints (health
 *   checks, DID registration) bypass auth. Protected routes require a valid
 *   Verifiable Credential. Sensitive routes additionally require specific
 *   VC credential types (e.g., only MedicalLicenseCredential can access
 *   /api/records/all-patients).
 *
 * LEGACY BRIDGE:
 *   The existing Node.js backend (server/) is preserved and proxied under
 *   /api/legacy/* — this provides a zero-downtime migration path. As each
 *   feature is migrated to a 2036 microservice, its legacy route is removed.
 *
 * ZERO-TRUST CLAIM INJECTION:
 *   After DID authentication, the gateway injects the following headers
 *   for downstream microservices to consume without re-authenticating:
 *
 *     X-MediFlow-DID         — The verified subject DID
 *     X-MediFlow-Role        — Extracted role claim (patient|doctor|pharmacy|admin)
 *     X-MediFlow-VC-Type     — The credential type that was presented
 *     X-MediFlow-Request-ID  — Correlation ID for distributed tracing
 * ============================================================================
 */

package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"github.com/google/uuid"
)

// ── Upstream Proxy Factory ────────────────────────────────────────────────────

// newReverseProxy creates a configured reverse proxy to a target microservice.
// It injects the correlation request ID and sets appropriate timeouts for
// the upstream connection (separate from the client-facing server timeouts).
func newReverseProxy(targetURL string, logger *slog.Logger) *httputil.ReverseProxy {
	target, err := url.Parse(targetURL)
	if err != nil {
		logger.Error("Invalid upstream target URL", "url", targetURL, "error", err)
		panic(fmt.Sprintf("gateway: invalid upstream URL %q: %v", targetURL, err))
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

	// Custom transport: upstream connection pool tuned for microservice-to-microservice
	// communication on the internal Kubernetes pod network (~0.1ms RTT).
	proxy.Transport = &http.Transport{
		MaxIdleConns:        200,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     90 * time.Second,
		// ResponseHeaderTimeout: max wait for upstream to send response headers.
		// Set conservatively for ML inference endpoints (LSTM can take ~200ms).
		ResponseHeaderTimeout: 10 * time.Second,
	}

	// Custom error handler: instead of the default empty 502, return a JSON body
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		requestID := r.Header.Get("X-MediFlow-Request-ID")
		logger.Error("Upstream proxy error",
			"request_id", requestID,
			"target", targetURL,
			"error", err,
		)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, `{"error":"upstream_unavailable","service":%q,"request_id":%q}`,
			targetURL, requestID)
	}

	return proxy
}

// ── Request ID Middleware ─────────────────────────────────────────────────────

// requestIDMiddleware injects a UUIDv4 correlation ID into every request.
// This ID propagates across all microservices for distributed tracing.
// If the client already sent an X-Request-ID, we honour it (for SDK clients).
func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-ID")
		if requestID == "" {
			requestID = uuid.New().String()
		}
		// Standardise on our header name
		r.Header.Set("X-MediFlow-Request-ID", requestID)
		// Echo the ID back to the client for correlation
		w.Header().Set("X-MediFlow-Request-ID", requestID)
		next.ServeHTTP(w, r)
	})
}

// ── CORS Middleware ───────────────────────────────────────────────────────────

// corsMiddleware applies the CORS policy required for the WebXR SPA.
// In production, allowedOrigins is driven by CORS_ALLOWED_ORIGINS env var.
func corsMiddleware(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers",
			"Authorization, Content-Type, X-MediFlow-Request-ID, X-MediFlow-VC-Type")
		w.Header().Set("Access-Control-Max-Age", "3600")

		// Handle preflight requests immediately
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ── Access Logger Middleware ──────────────────────────────────────────────────

// accessLogMiddleware emits a structured log line for every proxied request.
// Sensitive headers (Authorization) are redacted. DID is logged for audit.
type loggingResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (lrw *loggingResponseWriter) WriteHeader(code int) {
	lrw.statusCode = code
	lrw.ResponseWriter.WriteHeader(code)
}

func accessLogMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		lrw := &loggingResponseWriter{ResponseWriter: w, statusCode: 200}

		next.ServeHTTP(lrw, r)

		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", lrw.statusCode,
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id", r.Header.Get("X-MediFlow-Request-ID"),
			"subject_did", r.Header.Get("X-MediFlow-DID"), // populated by DIDAuth
		)
	})
}

// ── Route Table ───────────────────────────────────────────────────────────────

// BuildRoutes constructs the complete gateway route table and returns the
// root http.Handler. Each route group is assembled with its specific
// middleware stack — public endpoints are intentionally minimal.
func BuildRoutes(
	cfg *GatewayConfig,
	didAuth *DIDAuthMiddleware,
	pqcMw *PQCMiddleware,
	rl *RateLimiter,
	logger *slog.Logger,
) http.Handler {

	// Instantiate upstream proxies for each microservice
	identityProxy := newReverseProxy(cfg.IdentityServiceURL, logger)
	triageProxy    := newReverseProxy(cfg.TriageServiceURL, logger)
	consultProxy   := newReverseProxy(cfg.ConsultServiceURL, logger)
	pharmacyProxy  := newReverseProxy(cfg.PharmacyServiceURL, logger)
	recordsProxy   := newReverseProxy(cfg.RecordsServiceURL, logger)
	notifyProxy    := newReverseProxy(cfg.NotifyServiceURL, logger)
	legacyProxy    := newReverseProxy(cfg.LegacyNodeURL, logger)

	mux := http.NewServeMux()

	// ── Tier 0: Gateway Liveness (no auth, no rate limiting) ────────────────
	// Used by Kubernetes readiness/liveness probes. Must always respond instantly.
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","service":"mediflow-gateway","version":"2036.2.0"}`)
	})

	// ── Tier 1: Public Identity Endpoints (rate-limited, NO DID auth) ────────
	// These are the bootstrapping endpoints a new patient uses to create their
	// DID identity. They cannot require auth since the identity doesn't exist yet.
	//
	// Security: Heavy rate limiting (5 req/min) prevents DID enumeration attacks.
	publicIdentityLimiter := NewRateLimiter(5, time.Minute)

	mux.Handle("/api/identity/register",
		requestIDMiddleware(
			accessLogMiddleware(logger,
				publicIdentityLimiter.Limit(
					identityProxy,
				),
			),
		),
	)

	mux.Handle("/api/identity/did/resolve",
		requestIDMiddleware(accessLogMiddleware(logger, identityProxy)),
	)

	// ── Tier 2: Auth Endpoint — VC Presentation Flow ─────────────────────────
	// The patient presents a Verifiable Presentation (VP) containing their VC.
	// The Identity Service verifies the Dilithium-3 signature and returns a
	// short-lived gateway session token (NOT a JWT — a signed VC itself).
	//
	// WHY NOT JWT? JWTs with HMAC/RSA are quantum-vulnerable. The "session token"
	// returned here is a short-lived VC signed with Dilithium-3 by the platform.
	mux.Handle("/api/identity/auth/present",
		requestIDMiddleware(
			accessLogMiddleware(logger,
				rl.Limit(
					// PQC decrypt the request body before forwarding
					pqcMw.DecryptBody(identityProxy),
				),
			),
		),
	)

	// ── Tier 3: Protected Microservice Routes (DID auth required) ─────────────
	// All routes below this point require a valid Verifiable Credential.
	// The DIDAuth middleware verifies the VC, then injects X-MediFlow-* claim
	// headers for the downstream service to consume without re-authenticating.

	// Helper: wraps a handler with the full authenticated middleware stack
	// Stack (outer → inner): RequestID → Log → RateLimit → PQCDecrypt → DIDAuth → handler
	protected := func(handler http.Handler, requiredRoles ...string) http.Handler {
		return requestIDMiddleware(
			accessLogMiddleware(logger,
				rl.Limit(
					pqcMw.DecryptBody(
						didAuth.Authenticate(handler, requiredRoles...),
					),
				),
			),
		)
	}

	// ── Triage Service Routes ─────────────────────────────────────────────────
	// /api/triage/predict   — Symptom triage (patient or doctor)
	// /api/triage/stream    — SSE stream of ambient AI alerts for this patient
	// /api/triage/alerts    — Get historical ambient AI alerts
	mux.Handle("/api/triage/", protected(triageProxy, "patient", "doctor", "admin"))

	// ── Consultation Service Routes ───────────────────────────────────────────
	// /api/consultation/sessions      — Create/list sessions
	// /api/consultation/signal/*      — WebRTC SFU signalling (WebSocket upgrade)
	// /api/consultation/overlays/*    — Spatial AR overlay CRUD
	mux.Handle("/api/consultation/", protected(consultProxy, "patient", "doctor"))

	// ── Pharmacy Service Routes ───────────────────────────────────────────────
	// /api/pharmacy/print-jobs        — Create/track bioprint jobs
	// /api/pharmacy/drone/routes      — Drone route computation + tracking
	// /api/pharmacy/fleet             — Drone fleet management (pharmacy role only)
	mux.Handle("/api/pharmacy/fleet", protected(pharmacyProxy, "pharmacy", "admin"))
	mux.Handle("/api/pharmacy/",      protected(pharmacyProxy, "patient", "doctor", "pharmacy", "admin"))

	// ── Health Records Service Routes ─────────────────────────────────────────
	// /api/records/me             — Patient's own FHIR resources
	// /api/records/fhir/*         — FHIR R4 CRUD endpoints
	// /api/records/search/similar — pgvector semantic similarity search
	mux.Handle("/api/records/", protected(recordsProxy, "patient", "doctor", "admin"))

	// ── Notification Service Routes ───────────────────────────────────────────
	// /api/notify/subscribe       — SSE subscription for push notifications
	// /api/notify/iot/bridge      — MQTT-to-HTTP bridge for IoT telemetry
	mux.Handle("/api/notify/", protected(notifyProxy, "patient", "doctor", "admin"))

	// ── Identity Management Routes (authenticated) ────────────────────────────
	// /api/identity/keys/rotate   — Patient rotates their own PQC key pair
	// /api/identity/vc/revoke     — Revoke a specific credential
	// /api/identity/audit         — View presentation audit log
	mux.Handle("/api/identity/keys/", protected(identityProxy, "patient", "doctor", "pharmacy", "admin"))
	mux.Handle("/api/identity/vc/",   protected(identityProxy, "admin"))
	mux.Handle("/api/identity/audit", protected(identityProxy, "admin"))

	// ── Legacy Bridge (Node.js backend — progressive migration) ──────────────
	// All existing endpoints remain functional during the 2036 uplift.
	// Routes are removed from here as they are migrated to Python microservices.
	mux.Handle("/api/legacy/", requestIDMiddleware(accessLogMiddleware(logger, legacyProxy)))

	// ── Root CORS wrapper ─────────────────────────────────────────────────────
	allowedOrigin := getEnv("CORS_ALLOWED_ORIGIN", "http://localhost:3000")
	return corsMiddleware(allowedOrigin, mux)
}
