#!/bin/bash
# Lore — Startup Script
# Starts both the FastAPI backend and the Vite frontend dev server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Lore ==="
echo ""

# On macOS the system `python3` (Xcode CLT, /usr/bin/python3) and a
# user-installed `pip3` (Homebrew / pyenv) can point to different Python
# installations, causing "No module named 'b4'" even after pip3 installs it.
#
# Strategy: derive the Python executable that owns pip3 so they always match.
PIP3_PATH="$(command -v pip3 2>/dev/null || echo "")"
if [ -n "$PIP3_PATH" ]; then
    # pip3 lives in <prefix>/bin/pip3 → <prefix>/bin/python3
    PIP3_BIN_DIR="$(dirname "$PIP3_PATH")"
    if [ -x "$PIP3_BIN_DIR/python3" ]; then
        PYTHON="$PIP3_BIN_DIR/python3"
    elif [ -x "$PIP3_BIN_DIR/python" ]; then
        PYTHON="$PIP3_BIN_DIR/python"
    else
        PYTHON="python3"
    fi
else
    PYTHON="python3"
fi

echo "Using Python: $PYTHON"

# Install deps using the matched Python's pip module
"$PYTHON" -c "import b4, fastapi, uvicorn, anthropic, openai" 2>/dev/null || {
    echo "Installing Python dependencies..."
    "$PYTHON" -m pip install b4 fastapi uvicorn anthropic openai python-dotenv
}

# Start backend
echo "Starting backend (FastAPI on port 8765)..."
"$PYTHON" backend/main.py &
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
