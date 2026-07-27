#!/usr/bin/env python3
"""
run_services.py — MediFlow Enterprise Unified Multi-Service Orchestrator
================================================================================
Launches and monitors all 6 microservices + Client SPA concurrently.

Services launched:
  1. Client SPA Server        — http://localhost:5050
  2. Node.js API Server       — http://localhost:5000
  3. Python ML Engine         — http://localhost:8000
  4. Identity PQC Service     — http://localhost:8001
  5. Triage Service           — http://localhost:8002
  6. Pharmacy Service         — http://localhost:8003
================================================================================
"""

import os
import sys
import time
import signal
import subprocess
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler, ThreadingHTTPServer
import threading

# Force UTF-8 on Windows to avoid charmap encoding errors with special chars
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT_DIR = Path(__file__).parent.resolve()
processes = []

def log(msg: str):
    print(f"\033[36m[MediFlow Orchestrator]\033[0m {msg}", flush=True)

def start_process(cmd, cwd, name):
    log(f"Starting {name} in {cwd}...")
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            bufsize=1
        )
        processes.append((name, proc))
        
        def stream_logs():
            for line in proc.stdout:
                if line.strip():
                    print(f"[{name}] {line.strip()}", flush=True)
                    
        t = threading.Thread(target=stream_logs, daemon=True)
        t.start()
        return proc
    except Exception as e:
        log(f"Failed to start {name}: {e}")
        return None

def run_client_server(default_port=5050):
    client_dir = ROOT_DIR / "client"
    class QuietHTTPRequestHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(client_dir), **kwargs)
        def log_message(self, format, *args):
            pass # suppress verbose request logs
            
    for port in (default_port, 5051, 5052, 8080):
        try:
            server = ThreadingHTTPServer(('0.0.0.0', port), QuietHTTPRequestHandler)
            log(f"[OK] Client SPA live at http://localhost:{port}")
            server.serve_forever()
            return
        except Exception as e:
            pass
    log("Failed to bind Client SPA server on ports 5050, 5051, 5052, 8080")

def cleanup(sig=None, frame=None):
    log("Shutting down all services cleanly...")
    for name, proc in processes:
        try:
            log(f"Stopping {name} (PID: {proc.pid})...")
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            proc.kill()
    log("All services stopped.")
    sys.exit(0)

def main():
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    log("Starting MediFlow Enterprise Microservices...")

    # 1. Start Node Server (5000)
    start_process("npm start", ROOT_DIR / "server", "Node-Server")

    # 2. Start ML Engine (8000)
    start_process("python -m uvicorn main:app --host 0.0.0.0 --port 8000", ROOT_DIR / "ml-engine", "ML-Engine")

    # 3. Start Identity Service (8001)
    start_process("python -m uvicorn main:app --host 0.0.0.0 --port 8001", ROOT_DIR / "services" / "identity", "Identity-Service")

    # 4. Start Triage Service (8002)
    start_process("python -m uvicorn main:app --host 0.0.0.0 --port 8002", ROOT_DIR / "services" / "triage", "Triage-Service")

    # 5. Start Pharmacy Service (8003)
    start_process("python -m uvicorn main:app --host 0.0.0.0 --port 8003", ROOT_DIR / "services" / "pharmacy", "Pharmacy-Service")

    # 6. Start Client Server in thread (5050)
    client_thread = threading.Thread(target=run_client_server, args=(5050,), daemon=True)
    client_thread.start()

    log("\n" + "="*70)
    log("ALL MEDIFLOW SERVICES ACTIVE!")
    log("Open Client App: http://localhost:5050")
    log("Backend API Node: http://localhost:5050/api/v1/health")
    log("ML Engine Docs:  http://localhost:8000/docs")
    log("PQC Identity:    http://localhost:8001/docs")
    log("="*70 + "\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        cleanup()

if __name__ == "__main__":
    main()
