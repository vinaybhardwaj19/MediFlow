FROM openquantumsafe/curl:latest AS builder
# For the sake of the hackathon demo, we use a mock approach for OQS in Docker
# A real deployment would compile Envoy with oqs-provider C++ bindings here.
FROM envoyproxy/envoy:v1.31-latest
COPY envoy.yaml /etc/envoy/envoy.yaml
# We generate a dummy cert for TLS
USER root
RUN apt-get update && apt-get install -y openssl && \
    mkdir -p /etc/envoy/certs && \
    openssl req -new -newkey rsa:2048 -days 365 -nodes -x509 \
    -subj "/C=IN/ST=KA/L=BLR/O=MediFlow/CN=localhost" \
    -keyout /etc/envoy/certs/key.pem -out /etc/envoy/certs/cert.pem
CMD ["/usr/local/bin/envoy", "-c", "/etc/envoy/envoy.yaml", "-l", "info"]
