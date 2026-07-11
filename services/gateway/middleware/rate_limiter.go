/*
 * middleware/rate_limiter.go — Token-Bucket Rate Limiter (Per DID / Per IP)
 * ============================================================================
 *
 * DESIGN: Token-Bucket Algorithm
 *   The token-bucket algorithm allows bursty traffic up to a defined burst
 *   limit, while enforcing an average throughput limit. This matches real
 *   clinical traffic patterns better than leaky-bucket (fixed rate):
 *
 *   - A doctor opening the patient dashboard makes 5 requests simultaneously
 *     (burst) — the bucket absorbs this.
 *   - A DDoS bot sends 10,000 requests/second — the bucket drains instantly
 *     and subsequent requests are rejected with 429.
 *
 * KEYING STRATEGY:
 *   Rate limit key = X-MediFlow-DID header (if present after auth) OR client IP.
 *   This means:
 *   - Authenticated users are rate-limited per DID identity (not per IP).
 *     A hospital with many users behind one NAT IP is not unfairly throttled.
 *   - Unauthenticated requests (DID registration, health check) are limited per IP.
 *
 * NOTE: In production, the rate limiter state is stored in Redis (not in-process
 * map) to work correctly across multiple gateway replicas. This implementation
 * uses an in-process map for the single-node exhibition deployment.
 * ============================================================================
 */

package main

import (
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"
)

// ── Token Bucket ─────────────────────────────────────────────────────────────

// bucket represents a single entity's token bucket.
type bucket struct {
	tokens    float64   // Current token count (fractional for precision)
	lastRefill time.Time // Timestamp of the last token refill
	mu         sync.Mutex
}

// RateLimiter manages per-entity token buckets.
type RateLimiter struct {
	maxTokens   float64        // Bucket capacity = maximum burst size
	refillRate  float64        // Tokens added per nanosecond
	buckets     map[string]*bucket
	mu          sync.RWMutex
	cleanupTick *time.Ticker   // Periodically evicts stale bucket entries
}

// NewRateLimiter creates a rate limiter.
//   maxRequests: maximum requests allowed in one window (also the burst size)
//   window: the time window over which maxRequests is enforced
func NewRateLimiter(maxRequests int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		maxTokens:  float64(maxRequests),
		refillRate: float64(maxRequests) / float64(window.Nanoseconds()),
		buckets:    make(map[string]*bucket),
		cleanupTick: time.NewTicker(5 * time.Minute),
	}

	// Background goroutine to evict buckets for inactive entities.
	// Prevents memory growth in a long-running gateway.
	go rl.cleanupLoop()

	return rl
}

// Limit wraps a handler with rate limiting logic.
func (rl *RateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Determine the rate-limit key for this request
		key := rl.resolveKey(r)

		if !rl.allow(key) {
			requestID := r.Header.Get("X-MediFlow-Request-ID")
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			fmt.Fprintf(w, `{"error":"rate_limit_exceeded","retry_after_seconds":60,"request_id":%q}`,
				requestID)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// resolveKey returns the rate-limit key for a request.
// Authenticated requests are keyed by DID; unauthenticated by IP.
func (rl *RateLimiter) resolveKey(r *http.Request) string {
	// X-MediFlow-DID is injected by DIDAuth after successful verification.
	// If it exists, we're in the authenticated path.
	if did := r.Header.Get("X-MediFlow-DID"); did != "" {
		return "did:" + did
	}

	// Unauthenticated: use the client IP.
	// X-Forwarded-For is set by the load balancer (Envoy/Nginx) in front of us.
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return "ip:" + xff
	}

	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "ip:" + r.RemoteAddr
	}
	return "ip:" + ip
}

// allow checks if a request from the given key should be allowed.
// Returns true (allowed) or false (rate limit exceeded).
func (rl *RateLimiter) allow(key string) bool {
	rl.mu.RLock()
	b, exists := rl.buckets[key]
	rl.mu.RUnlock()

	if !exists {
		// New entity — create a full bucket and allow immediately
		rl.mu.Lock()
		// Double-check after acquiring write lock (concurrent goroutine may have created it)
		if b, exists = rl.buckets[key]; !exists {
			b = &bucket{
				tokens:    rl.maxTokens - 1, // -1 for this request
				lastRefill: time.Now(),
			}
			rl.buckets[key] = b
			rl.mu.Unlock()
			return true
		}
		rl.mu.Unlock()
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	// Refill tokens based on time elapsed since last request
	now := time.Now()
	elapsed := now.Sub(b.lastRefill).Nanoseconds()
	b.tokens += float64(elapsed) * rl.refillRate
	if b.tokens > rl.maxTokens {
		b.tokens = rl.maxTokens // Cap at bucket capacity
	}
	b.lastRefill = now

	if b.tokens < 1.0 {
		return false // Bucket empty — rate limited
	}

	b.tokens -= 1.0 // Consume one token for this request
	return true
}

// cleanupLoop evicts stale bucket entries every 5 minutes.
// An entry is stale if no request has been made for more than 10 minutes.
func (rl *RateLimiter) cleanupLoop() {
	for range rl.cleanupTick.C {
		rl.mu.Lock()
		for key, b := range rl.buckets {
			b.mu.Lock()
			stale := time.Since(b.lastRefill) > 10*time.Minute
			b.mu.Unlock()
			if stale {
				delete(rl.buckets, key)
			}
		}
		rl.mu.Unlock()
	}
}
