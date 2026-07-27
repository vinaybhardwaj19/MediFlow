FROM python:3.11-slim

WORKDIR /app

# Install system deps for scikit-learn / numpy (slim image needs these)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc python3-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Remove dev/sensitive files
RUN rm -f .env .env.* 2>/dev/null; true

# Security: run as non-root
RUN useradd -m -r mediflow && chown -R mediflow:mediflow /app
USER mediflow

EXPOSE 8000

# Health check — matches the /health endpoint in main.py
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
