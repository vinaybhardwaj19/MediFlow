/*
 * middleware/pqc_decrypt.go — Post-Quantum Cryptography Request Decryption
 * ============================================================================
 *
 * FUTURISTIC MECHANIC: HYBRID POST-QUANTUM ENCRYPTION LAYER
 *
 *   REAL-WORLD PROBLEM:
 *     Standard HTTPS uses RSA or ECDH for the TLS key exchange. A sufficiently
 *     large quantum computer running Shor's algorithm can break RSA-2048 in
 *     hours. All intercepted HTTPS traffic recorded today ("harvest now, decrypt
 *     later") becomes retroactively readable once quantum computers mature
 *     (~2030-2035 threat horizon).
 *
 *   SOLUTION:
 *     The MediFlow 2036 platform uses a HYBRID approach:
 *
 *     LAYER 1 — TLS Handshake (handled by Envoy/load balancer):
 *       X25519 (classical ECDH) + Kyber-768 (PQC KEM) hybrid key exchange.
 *       Both must be broken simultaneously for the session key to be recovered.
 *       This is the NIST/IETF standard for post-quantum TLS (hybrid KEM).
 *
 *     LAYER 2 — Application Layer Encryption (this middleware):
 *       For the most sensitive requests (health record writes, VC presentations,
 *       prescription submissions), the client ADDITIONALLY encrypts the request
 *       body with a Kyber-768 encapsulated key. This is defence-in-depth —
 *       even if the TLS layer were compromised, the body is still encrypted.
 *
 *   ENCRYPTION FLOW (client-side, executed in WASM on the browser):
 *     1. Client generates a random AES-256 content key
 *     2. Client encapsulates the content key using the gateway's Kyber-768
 *        public key → produces (ciphertext_kem, shared_secret)
 *     3. Client encrypts request body: AES-256-GCM(content_key, body)
 *     4. Client sends:
 *          X-MediFlow-PQC-KEM: base64url(ciphertext_kem)
 *          X-MediFlow-PQC-NONCE: base64url(aes_gcm_nonce)
 *          Body: base64url(aes_gcm_ciphertext)
 *
 *   DECRYPTION FLOW (this middleware):
 *     1. Check for X-MediFlow-PQC-KEM header
 *     2. If absent → request is plaintext (legacy clients, internal services)
 *     3. If present → call Identity Service to decapsulate the KEM ciphertext
 *        using the gateway's Kyber-768 private key → recover content key
 *     4. Decrypt body with recovered content key (AES-256-GCM)
 *     5. Replace r.Body with the decrypted plaintext for downstream handlers
 *
 * NOTE FOR EXHIBITION:
 *   The Kyber-768 private key resides in the Identity Service's HSM (or a
 *   local encrypted file for the demo). The gateway NEVER holds private keys.
 *   This architecture is called "key delegation" and is standard in enterprise
 *   KMS (Key Management Service) designs.
 * ============================================================================
 */

package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

// ── PQC Header Names ──────────────────────────────────────────────────────────
// These are the custom HTTP headers that signal a PQC-encrypted body.
// Their presence/absence is the gate condition for this middleware.
const (
	HeaderPQCKEM   = "X-MediFlow-PQC-KEM"   // Kyber-768 KEM ciphertext (base64url)
	HeaderPQCNonce = "X-MediFlow-PQC-Nonce"  // AES-256-GCM nonce (base64url, 12 bytes)
)

// ── Types ─────────────────────────────────────────────────────────────────────

// PQCMiddleware manages the Post-Quantum Cryptography decryption layer.
type PQCMiddleware struct {
	logger             *slog.Logger
	identityServiceURL string
	httpClient         *http.Client
}

// DecapsulateRequest is sent to the Identity Service to decapsulate a
// Kyber-768 KEM ciphertext. The Identity Service holds the private key.
type DecapsulateRequest struct {
	// The Kyber-768 KEM ciphertext (base64url), from the X-MediFlow-PQC-KEM header
	KEMCiphertext string `json:"kem_ciphertext"`
	// The key ID of the gateway's Kyber-768 keypair to use for decapsulation
	KeyID         string `json:"key_id"`
}

// DecapsulateResponse contains the recovered shared secret (the AES content key).
type DecapsulateResponse struct {
	// The recovered 32-byte AES-256 key (base64url-encoded)
	SharedSecretB64 string `json:"shared_secret"`
}

// ── Constructor ───────────────────────────────────────────────────────────────

// NewPQCMiddleware creates the PQC decryption middleware.
func NewPQCMiddleware(logger *slog.Logger) *PQCMiddleware {
	return &PQCMiddleware{
		logger:             logger,
		identityServiceURL: getEnv("IDENTITY_SERVICE_URL", "http://identity:8001"),
		httpClient: &http.Client{
			Timeout: 2 * time.Second, // Kyber-768 decapsulation: ~0.1ms. Budget: 2s total.
			Transport: &http.Transport{
				MaxIdleConnsPerHost: 20,
			},
		},
	}
}

// ── Core Middleware ───────────────────────────────────────────────────────────

// DecryptBody returns an http.Handler that transparently decrypts PQC-encrypted
// request bodies before passing them to the next handler.
//
// If the X-MediFlow-PQC-KEM header is absent, the request is passed through
// unchanged (backwards compatibility with legacy Node.js bridge traffic).
func (p *PQCMiddleware) DecryptBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-MediFlow-Request-ID")

		// ── Gate: Check for PQC encryption headers ────────────────────────────
		kemCiphertext := r.Header.Get(HeaderPQCKEM)
		nonce := r.Header.Get(HeaderPQCNonce)

		// If no PQC headers: this is a plaintext request. Pass through.
		// This handles: internal service-to-service calls, legacy Node.js traffic,
		// and WebSocket upgrade requests (which have no body to encrypt).
		if kemCiphertext == "" {
			next.ServeHTTP(w, r)
			return
		}

		// Both headers must be present together
		if nonce == "" {
			p.logger.Warn("PQC-KEM header present but PQC-Nonce missing",
				"request_id", requestID)
			http.Error(w, `{"error":"invalid_pqc_headers","detail":"X-MediFlow-PQC-Nonce required with X-MediFlow-PQC-KEM"}`,
				http.StatusBadRequest)
			return
		}

		// ── Step 1: Read the encrypted body ───────────────────────────────────
		// Limit to 10MB to prevent memory exhaustion attacks on the gateway.
		encryptedBody, err := io.ReadAll(io.LimitReader(r.Body, 10*1024*1024))
		r.Body.Close()
		if err != nil {
			http.Error(w, `{"error":"body_read_error"}`, http.StatusBadRequest)
			return
		}

		// The body is base64url-encoded AES-256-GCM ciphertext
		ciphertextBytes, err := base64.RawURLEncoding.DecodeString(string(encryptedBody))
		if err != nil {
			http.Error(w, `{"error":"invalid_body_encoding","detail":"body must be base64url-encoded AES-GCM ciphertext"}`,
				http.StatusBadRequest)
			return
		}

		// ── Step 2: Decapsulate Kyber-768 KEM ciphertext ─────────────────────
		// Call the Identity Service to recover the AES content key.
		// The gateway does NOT hold the Kyber-768 private key.
		aesKey, err := p.decapsulateKEM(kemCiphertext, requestID)
		if err != nil {
			p.logger.Error("Kyber-768 decapsulation failed",
				"request_id", requestID,
				"error", err,
			)
			http.Error(w, `{"error":"decryption_failed","detail":"kyber_decapsulation_error"}`,
				http.StatusBadRequest)
			return
		}

		// ── Step 3: Decode the AES-256-GCM nonce ─────────────────────────────
		nonceBytes, err := base64.RawURLEncoding.DecodeString(nonce)
		if err != nil || len(nonceBytes) != 12 {
			http.Error(w, `{"error":"invalid_nonce","detail":"nonce must be 12-byte base64url"}`,
				http.StatusBadRequest)
			return
		}

		// ── Step 4: AES-256-GCM Decryption ───────────────────────────────────
		plaintext, err := aesGCMDecrypt(aesKey, nonceBytes, ciphertextBytes)
		if err != nil {
			// AES-GCM authentication failure = tampered ciphertext (MITM attack attempt)
			p.logger.Warn("AES-256-GCM authentication tag mismatch — possible tampering",
				"request_id", requestID,
			)
			http.Error(w, `{"error":"decryption_failed","detail":"authentication_tag_mismatch"}`,
				http.StatusBadRequest)
			return
		}

		// ── Step 5: Replace request body with decrypted plaintext ─────────────
		// The downstream handlers (DIDAuth, microservice proxy) see a normal
		// plaintext JSON body — they are completely unaware of the PQC layer.
		r.Body = io.NopCloser(bytes.NewReader(plaintext))
		r.ContentLength = int64(len(plaintext))

		// Remove PQC headers — they've been processed and are not needed downstream
		r.Header.Del(HeaderPQCKEM)
		r.Header.Del(HeaderPQCNonce)
		// Mark the request as having been PQC-decrypted (for audit logging)
		r.Header.Set("X-MediFlow-PQC-Decrypted", "true")

		p.logger.Debug("PQC body decryption successful",
			"request_id", requestID,
			"plaintext_bytes", len(plaintext),
		)

		next.ServeHTTP(w, r)
	})
}

// ── Internal: KEM Decapsulation ───────────────────────────────────────────────

// decapsulateKEM calls the Identity Service to decapsulate a Kyber-768 KEM
// ciphertext and recover the 32-byte AES-256 content key.
//
// The Identity Service uses the liboqs-python Kyber-768 decapsulation function:
//   kem = oqs.KeyEncapsulation('Kyber768', secret_key=gateway_private_key_bytes)
//   shared_secret = kem.decap_secret(kem_ciphertext_bytes)
func (p *PQCMiddleware) decapsulateKEM(kemCiphertext, requestID string) ([]byte, error) {
	reqBody := DecapsulateRequest{
		KEMCiphertext: kemCiphertext,
		KeyID:         "gateway-kyber768-v1", // The gateway's key ID in the PQC key vault
	}

	bodyBytes, _ := json.Marshal(reqBody)

	req, err := http.NewRequest(
		http.MethodPost,
		fmt.Sprintf("%s/internal/pqc/decapsulate", p.identityServiceURL),
		bytes.NewReader(bodyBytes),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create decapsulate request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-MediFlow-Request-ID", requestID)
	req.Header.Set("X-MediFlow-Caller", "gateway")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("identity service unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("decapsulation rejected: status %d", resp.StatusCode)
	}

	var decapResp DecapsulateResponse
	if err := json.NewDecoder(resp.Body).Decode(&decapResp); err != nil {
		return nil, fmt.Errorf("failed to decode decapsulate response: %w", err)
	}

	// Decode the returned shared secret (32 bytes for AES-256)
	key, err := base64.RawURLEncoding.DecodeString(decapResp.SharedSecretB64)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("invalid shared secret from identity service: %w", err)
	}

	return key, nil
}

// ── AES-256-GCM Decryption ────────────────────────────────────────────────────

// aesGCMDecrypt decrypts AES-256-GCM ciphertext using the given key and nonce.
//
// AES-256-GCM provides both confidentiality AND authenticated integrity:
// if any byte of the ciphertext was modified in transit, Open() returns an
// error — this is the "authentication tag mismatch" check above.
//
// Key: 32 bytes (256-bit AES key, recovered via Kyber-768 decapsulation)
// Nonce: 12 bytes (96-bit GCM nonce, sent in X-MediFlow-PQC-Nonce header)
// Ciphertext: N bytes + 16-byte GCM authentication tag (appended by encryptor)
func aesGCMDecrypt(key, nonce, ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes cipher init: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("gcm init: %w", err)
	}

	// Open() authenticates AND decrypts in one operation.
	// Returns (plaintext, nil) on success, (nil, error) if authentication fails.
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("gcm open (authentication failure): %w", err)
	}

	return plaintext, nil
}
