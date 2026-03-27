#!/bin/bash
# Lore — Startup Script
# Starts both the FastAPI backend and the Vite frontend dev server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Lore ==="
echo ""

# Check Python deps (including b4)
python3 -c "import b4, fastapi, uvicorn, anthropic, openai" 2>/dev/null || {
    echo "Installing Python dependencies..."
    pip install b4 fastapi uvicorn anthropic openai python-dotenv
}

# Start backend
echo "Starting backend (FastAPI on port 8765)..."
python3 backend/main.py &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo "Waiting for backend..."
for i in $(seq 1 10); do
    if curl -s http://localhost:8765/api/health >/dev/null 2>&1; then
        echo "Backend ready!"
        break
    fi
    sleep 1
done

# Start frontend
echo ""
echo "Starting frontend (Vite on port 3000)..."
echo ""
echo "Dashboard will be available at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# Trap Ctrl+C to kill both processes
trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID 2>/dev/null; exit 0" INT TERM

pnpm dev

# Cleanup
kill $BACKEND_PID 2>/dev/null
