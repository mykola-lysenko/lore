#!/bin/bash
# Lore — Startup Script
# Starts both the FastAPI backend and the Vite frontend dev server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_PORT=8765
VENV_DIR="$SCRIPT_DIR/.venv"

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
# 2. Find a base Python to create the virtualenv with
#    (we only need it to have the `venv` stdlib module — no pip required)
#
# Priority: pyenv shim → Homebrew arm64 → Homebrew x86 → versioned on PATH
# Skips: /usr/bin/python3 (macOS stub), *fbcode* (Meta stub), *Xcode* stubs
# ---------------------------------------------------------------------------
python_has_venv() {
    local py="$1"
    [ -x "$py" ] || return 1
    local real_py
    real_py="$(readlink -f "$py" 2>/dev/null || realpath "$py" 2>/dev/null || echo "$py")"
    case "$real_py" in
        /usr/bin/python3) return 1 ;;
        *fbcode*)         return 1 ;;
        *Xcode*)          return 1 ;;
    esac
    "$py" -c "import venv" >/dev/null 2>&1 || return 1
    return 0
}

BASE_PYTHON=""
for candidate in \
    "$HOME/.pyenv/shims/python3" \
    "/opt/homebrew/bin/python3" \
    "/opt/homebrew/bin/python3.14" \
    "/opt/homebrew/bin/python3.13" \
    "/opt/homebrew/bin/python3.12" \
    "/opt/homebrew/bin/python3.11" \
    "/opt/homebrew/bin/python3.10"; do
    if python_has_venv "$candidate"; then
        BASE_PYTHON="$candidate"
        break
    fi
done

if [ -z "$BASE_PYTHON" ]; then
    for ver in python3.14 python3.13 python3.12 python3.11 python3.10 python3.9 python3; do
        candidate="$(command -v $ver 2>/dev/null || echo "")"
        if python_has_venv "$candidate"; then
            BASE_PYTHON="$candidate"
            break
        fi
    done
fi

if [ -z "$BASE_PYTHON" ]; then
    echo "ERROR: Could not find a usable Python 3 (with venv module)."
    echo "Please install Python via Homebrew: brew install python"
    exit 1
fi

echo "Base Python: $BASE_PYTHON"

# ---------------------------------------------------------------------------
# 3. Create virtualenv if it doesn't exist yet
# ---------------------------------------------------------------------------
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtualenv at .venv/ ..."
    "$BASE_PYTHON" -m venv "$VENV_DIR"
fi

# Use the venv's Python and pip from here on
PYTHON="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"

echo "Using venv Python: $PYTHON"

# ---------------------------------------------------------------------------
# 4. Install / upgrade Python dependencies into the venv
# ---------------------------------------------------------------------------
"$PYTHON" -c "import b4, fastapi, uvicorn, anthropic, openai" 2>/dev/null || {
    echo "Installing Python dependencies into .venv/ ..."
    "$PIP" install --quiet --upgrade pip
    "$PIP" install --quiet b4 fastapi uvicorn anthropic openai python-dotenv
    echo "Dependencies installed."
}

# ---------------------------------------------------------------------------
# 5. Start backend
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
# 6. Start frontend
# ---------------------------------------------------------------------------
echo ""
echo "Starting frontend (Vite on port 3000)..."
echo ""
echo "Dashboard will be available at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

cleanup() {
    echo ""
    echo "Stopping..."
    kill $BACKEND_PID 2>/dev/null || true
    lsof -ti tcp:$BACKEND_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    exit 0
}
trap cleanup INT TERM

pnpm dev

kill $BACKEND_PID 2>/dev/null || true
