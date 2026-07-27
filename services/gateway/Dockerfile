# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS build
WORKDIR /app

# Cache Go module downloads
COPY go.mod go.sum* ./
RUN go mod download

# Build static binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o gateway .

# ── Production stage (~15MB final image) ──────────────────────────────────────
FROM alpine:3.20

# Security: add CA certs for HTTPS calls to downstream services + non-root user
RUN apk --no-cache add ca-certificates && \
    addgroup -S mediflow && adduser -S mediflow -G mediflow

WORKDIR /app
COPY --from=build /app/gateway /usr/local/bin/gateway

USER mediflow

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["gateway"]
