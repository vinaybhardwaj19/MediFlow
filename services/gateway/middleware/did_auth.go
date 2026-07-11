/*
 * middleware/did_auth.go — DID & Verifiable Credential Authentication Middleware
 * ============================================================================
 *
 * FUTURISTIC MECHANIC: PASSWORDLESS AUTHENTICATION VIA VERIFIABLE CREDENTIALS
 *
 *   Traditional auth: client sends username+password → server looks up bcrypt
 *   hash in DB → issues JWT. The server holds all the power. One DB breach
 *   exposes all credentials.
 *
 *   2036 DID Auth: client holds a cryptographic identity (DID) with a private
 *   key that NEVER leaves their device. To authenticate:
 *
 *     1. Client creates a Verifiable Presentation (VP) — a JSON-LD envelope
 *        containing their Verifiable Credential (VC), signed with their
 *        Dilithium-3 private key.
 *
 *     2. Client sends: Authorization: DID-VP <base64url(VP_JSON)>
 *
 *     3. Gateway's DIDAuth middleware intercepts and:
 *        a) Parses the VP from the Authorization header
 *        b) Extracts the subject DID and credential type
 *        c) Calls the Identity Service's /internal/verify endpoint
 *        d) The Identity Service: fetches the DID's Dilithium-3 public key
 *           from the pqc_key_vault, verifies the Dilithium-3 signature
 *        e) Returns verified claims: {did, role, permissions, vc_type}
 *        f) Gateway injects X-MediFlow-* claim headers for downstream services
 *
 *   The server NEVER sees or stores the private key. Even if the DB is
 *   compromised, attackers get only public keys — useless without the private key.
 *
 * RBAC ENFORCEMENT:
 *   Each route is registered with a list of allowed roles (e.g., "doctor", "admin").
 *   After verification, the middleware checks the 'role' claim from the VC against
 *   the allowed list. This is cryptographic RBAC — the role cannot be forged
 *   because it is embedded in the Dilithium-3-signed credential.
 * ============================================================================
 */

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

// DIDAuthMiddleware holds the configuration for the auth middleware.
// It is constructed once at startup and shared across all route handlers.
type DIDAuthMiddleware struct {
	identityServiceURL string
	httpClient         *http.Client
	logger             *slog.Logger
}

// VerifyRequest is the payload sent to the Identity Service for VC verification.
type VerifyRequest struct {
	// The raw Verifiable Presentation JSON (base64url decoded from the Authorization header)
	PresentationJSON string `json:"presentation_json"`
	// The request timestamp for replay attack prevention (VP must be issued within 2 minutes)
	RequestTimestamp int64  `json:"request_timestamp"`
}

// VerifyResponse is the response from the Identity Service after successful verification.
// These fields become the X-MediFlow-* headers injected into the upstream request.
type VerifyResponse struct {
	// The verified subject DID (e.g., "did:mediflow:abc123")
	SubjectDID string `json:"subject_did"`
	// The role extracted from the credential subject (patient | doctor | pharmacy | admin)
	Role       string `json:"role"`
	// The credential type that was presented (PatientIdentityCredential, MedicalLicenseCredential, etc.)
	VCType     string `json:"vc_type"`
	// Expiry of the presented credential (gateway rejects if already expired)
	ExpiresAt  int64  `json:"expires_at"`
	// Specific permissions array (fine-grained RBAC beyond role)
	Permissions []string `json:"permissions"`
}

// ── Constructor ───────────────────────────────────────────────────────────────

// NewDIDAuthMiddleware creates the DID authentication middleware.
// The httpClient is configured with aggressive timeouts — auth must be fast.
// A 3-second timeout to the Identity Service is generous for a crypto verify op.
func NewDIDAuthMiddleware(identityServiceURL string, logger *slog.Logger) *DIDAuthMiddleware {
	return &DIDAuthMiddleware{
		identityServiceURL: identityServiceURL,
		logger:             logger,
		httpClient: &http.Client{
			Timeout: 3 * time.Second, // Dilithium-3 verify: ~0.5ms. Network: ~1ms (pod-to-pod). Total budget: 3s.
			Transport: &http.Transport{
				MaxIdleConnsPerHost: 50, // Connection pool to Identity Service
			},
		},
	}
}

// ── Core Middleware ───────────────────────────────────────────────────────────

// Authenticate returns an http.Handler that:
//  1. Extracts the DID Verifiable Presentation from the Authorization header
//  2. Forwards it to the Identity Service for Dilithium-3 signature verification
//  3. Enforces RBAC: checks the verified role against the allowedRoles list
//  4. Injects X-MediFlow-* claim headers for the downstream microservice
//  5. Passes to the next handler if all checks pass, or returns 401/403
func (m *DIDAuthMiddleware) Authenticate(next http.Handler, allowedRoles ...string) http.Handler {
	// Pre-compute the role set for O(1) lookup
	roleSet := make(map[string]struct{}, len(allowedRoles))
	for _, r := range allowedRoles {
		roleSet[r] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-MediFlow-Request-ID")

		// ── Step 1: Extract Authorization Header ──────────────────────────────
		// Expected format: "DID-VP <base64url-encoded-verifiable-presentation>"
		//
		// WHY NOT "Bearer"? The Bearer scheme implies an opaque token managed
		// by the server. "DID-VP" explicitly signals that this is a self-sovereign
		// Verifiable Presentation — an open standard, not a proprietary token.
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			m.unauthorised(w, requestID, "missing_authorization_header")
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "DID-VP" {
			m.unauthorised(w, requestID, "invalid_auth_scheme: expected 'DID-VP <presentation>'")
			return
		}

		presentationB64 := parts[1]

		// ── Step 2: Forward to Identity Service for Verification ─────────────
		// The gateway does NOT perform cryptographic operations itself.
		// This is a deliberate security boundary: all key material and PQC
		// operations are isolated within the Identity microservice.
		claims, err := m.verifyWithIdentityService(presentationB64, requestID)
		if err != nil {
			m.logger.Warn("VC verification failed",
				"request_id", requestID,
				"error", err,
			)
			m.unauthorised(w, requestID, err.Error())
			return
		}

		// ── Step 3: Check Credential Expiry ───────────────────────────────────
		// Guard against the Identity Service returning an expired VC that it
		// somehow still verified (defence in depth — double check at gateway).
		if claims.ExpiresAt > 0 && time.Now().Unix() > claims.ExpiresAt {
			m.unauthorised(w, requestID, "credential_expired")
			return
		}

		// ── Step 4: RBAC Role Enforcement ─────────────────────────────────────
		// Check the cryptographically-verified role claim against the route's
		// allowed role set. This cannot be forged — the role is embedded inside
		// the Dilithium-3-signed credential.
		if len(allowedRoles) > 0 {
			if _, allowed := roleSet[claims.Role]; !allowed {
				m.forbidden(w, requestID, claims.SubjectDID, claims.Role)
				return
			}
		}

		// ── Step 5: Inject Claim Headers ──────────────────────────────────────
		// Remove any client-supplied X-MediFlow-* headers FIRST (security: prevent
		// header spoofing — a malicious client could try to inject fake role headers).
		r.Header.Del("X-MediFlow-DID")
		r.Header.Del("X-MediFlow-Role")
		r.Header.Del("X-MediFlow-VC-Type")
		r.Header.Del("X-MediFlow-Permissions")

		// Now inject the VERIFIED values from the Identity Service response
		r.Header.Set("X-MediFlow-DID", claims.SubjectDID)
		r.Header.Set("X-MediFlow-Role", claims.Role)
		r.Header.Set("X-MediFlow-VC-Type", claims.VCType)
		r.Header.Set("X-MediFlow-Permissions", strings.Join(claims.Permissions, ","))

		// Remove the Authorization header before forwarding downstream.
		// Microservices must NOT re-verify the VC — they trust the gateway's
		// injected headers (internal network trust boundary).
		r.Header.Del("Authorization")

		m.logger.Debug("DID authentication successful",
			"request_id", requestID,
			"subject_did", claims.SubjectDID,
			"role", claims.Role,
			"vc_type", claims.VCType,
		)

		next.ServeHTTP(w, r)
	})
}

// ── Internal: Identity Service Call ──────────────────────────────────────────

// verifyWithIdentityService sends the Verifiable Presentation to the Identity
// Service's internal verification endpoint and returns the extracted claims.
// This is a synchronous RPC — the total call budget is 3 seconds (see constructor).
func (m *DIDAuthMiddleware) verifyWithIdentityService(
	presentationB64 string,
	requestID string,
) (*VerifyResponse, error) {

	reqBody := VerifyRequest{
		PresentationJSON: presentationB64,
		RequestTimestamp: time.Now().Unix(),
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("internal_error: failed to marshal verify request")
	}

	// POST to the Identity Service's internal verification endpoint.
	// "/internal/verify" is NOT exposed through the gateway (no route registered)
	// — it is only reachable on the internal pod network.
	verifyURL := fmt.Sprintf("%s/internal/verify", m.identityServiceURL)
	req, err := http.NewRequest(http.MethodPost, verifyURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("internal_error: failed to create verify request")
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-MediFlow-Request-ID", requestID)
	// Gateway identifies itself to the Identity Service
	req.Header.Set("X-MediFlow-Caller", "gateway")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("identity_service_unavailable: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 4096)) // Cap at 4KB
	if err != nil {
		return nil, fmt.Errorf("internal_error: failed to read identity response")
	}

	// Map HTTP status codes from the Identity Service to auth error types
	switch resp.StatusCode {
	case http.StatusOK:
		// Success path — parse the verified claims
	case http.StatusUnauthorized:
		// Invalid signature or malformed VP
		var errResp map[string]string
		json.Unmarshal(respBody, &errResp) //nolint:errcheck
		reason := errResp["detail"]
		if reason == "" {
			reason = "invalid_credential"
		}
		return nil, fmt.Errorf("%s", reason)
	case http.StatusGone:
		return nil, fmt.Errorf("credential_revoked")
	case http.StatusUnprocessableEntity:
		return nil, fmt.Errorf("credential_expired")
	default:
		return nil, fmt.Errorf("identity_service_error: status %d", resp.StatusCode)
	}

	var claims VerifyResponse
	if err := json.Unmarshal(respBody, &claims); err != nil {
		return nil, fmt.Errorf("internal_error: failed to parse identity response")
	}

	return &claims, nil
}

// ── Error Response Helpers ────────────────────────────────────────────────────

func (m *DIDAuthMiddleware) unauthorised(w http.ResponseWriter, requestID, reason string) {
	m.logger.Warn("Authentication rejected", "request_id", requestID, "reason", reason)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("WWW-Authenticate", `DID-VP realm="MediFlow 2036"`)
	w.WriteHeader(http.StatusUnauthorized)
	fmt.Fprintf(w, `{"error":"authentication_failed","reason":%q,"request_id":%q}`,
		reason, requestID)
}

func (m *DIDAuthMiddleware) forbidden(w http.ResponseWriter, requestID, did, role string) {
	m.logger.Warn("Authorization rejected",
		"request_id", requestID,
		"did", did,
		"role", role,
	)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	fmt.Fprintf(w, `{"error":"forbidden","reason":"insufficient_role","your_role":%q,"request_id":%q}`,
		role, requestID)
}
