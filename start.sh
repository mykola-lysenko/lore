#!/bin/bash
# Lore — Startup Script
# Starts both the FastAPI backend and the Vite frontend dev server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_PORT=8765

echo "=== Lore ==="
echo ""

# ---------------------------------------------------------------------------
# 1. Kill any stale process already listening on the backend port
# ---------------------------------------------------------------------------
STALE_PID=$(lsof -ti tcp:$BACKEND_PORT 2>/dev/null || true)
if [ -n "$STALE_PID" ]; then
    echo "Port $BACKEND_PORT in use by PID $STALE_PID — killing stale process..."
    kill -9 $STALE_PID 2>/dev/null || true
    sleep 1
fi

# ---------------------------------------------------------------------------
# 2. Resolve the correct Python interpreter
#
# We need a Python that:
#   - is NOT the macOS system stub (/usr/bin/python3)
#   - is NOT a Meta/fbcode stub (/usr/local/fbcode/...)
#   - has pip available (can run: python -m pip --version)
#
# Priority order:
#   a) pyenv shim  (~/.pyenv/shims/python3)
#   b) Homebrew arm64 (/opt/homebrew/bin/python3)
#   c) pip3-sibling  (same bin dir as pip3)
#   d) python3.11 / python3.10 / python3.9 on PATH
#   e) plain python3 on PATH
# ---------------------------------------------------------------------------

# Helper: returns 0 if the given python has pip and is not a known stub
python_is_usable() {
    local py="$1"
    [ -x "$py" ] || return 1
    # Skip known stubs
    case "$py" in
        /usr/bin/python3) return 1 ;;
        *fbcode*) return 1 ;;
        *Xcode*) return 1 ;;
    esac
    # Must be able to run pip
    "$py" -m pip --version >/dev/null 2>&1 || return 1
    return 0
}

PYTHON=""

for candidate in \
    "$HOME/.pyenv/shims/python3" \
    "/opt/homebrew/bin/python3" \
    "/opt/homebrew/bin/python3.12" \
    "/opt/homebrew/bin/python3.11" \
    "/opt/homebrew/bin/python3.10"; do
    if python_is_usable "$candidate"; then
        PYTHON="$candidate"
        break
    fi
done

# Try pip3-sibling
if [ -z "$PYTHON" ]; then
    PIP3_PATH="$(command -v pip3 2>/dev/null || echo "")"
    if [ -n "$PIP3_PATH" ]; then
        PIP3_BIN_DIR="$(dirname "$PIP3_PATH")"
        for candidate in "$PIP3_BIN_DIR/python3" "$PIP3_BIN_DIR/python"; do
            if python_is_usable "$candidate"; then
                PYTHON="$candidate"
                break
            fi
        done
    fi
fi

# Try versioned python3.x on PATH
if [ -z "$PYTHON" ]; then
    for ver in python3.12 python3.11 python3.10 python3.9 python3; do
        candidate="$(command -v $ver 2>/dev/null || echo "")"
        if python_is_usable "$candidate"; then
            PYTHON="$candidate"
            break
        fi
    done
fi

if [ -z "$PYTHON" ]; then
    echo "ERROR: Could not find a usable Python with pip."
    echo "Please install Python via Homebrew: brew install python"
    exit 1
fi

echo "Using Python: $PYTHON"

# ---------------------------------------------------------------------------
# 3. Install missing Python dependencies
# ---------------------------------------------------------------------------
"$PYTHON" -c "import b4, fastapi, uvicorn, anthropic, openai" 2>/dev/null || {
    echo "Installing Python dependencies..."
    "$PYTHON" -m pip install b4 fastapi uvicorn anthropic openai python-dotenv
}

# ---------------------------------------------------------------------------
# 4. Start backend
# ---------------------------------------------------------------------------
echo "Starting backend (FastAPI on port $BACKEND_PORT)..."
"$PYTHON" backend/main.py &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend to be ready (up to 15 s)
echo "Waiting for backend..."
for i in $(seq 1 15); do
    if curl -s http://localhost:$BACKEND_PORT/api/health >/dev/null 2>&1; then
        echo "Backend ready!"
        break
    fi
    sleep 1
done

# ---------------------------------------------------------------------------
# 5. Start frontend
# ---------------------------------------------------------------------------
echo ""
echo "Starting frontend (Vite on port 3000)..."
echo ""
echo "Dashboard will be available at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# Trap Ctrl+C / TERM to kill both processes cleanly
cleanup() {
    echo ""
    echo "Stopping..."
    kill $BACKEND_PID 2>/dev/null || true
    # Also kill any process still on the backend port (e.g. if uvicorn forked)
    lsof -ti tcp:$BACKEND_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    exit 0
}
trap cleanup INT TERM

pnpm dev

# Cleanup on normal exit
kill $BACKEND_PID 2>/dev/null || true
