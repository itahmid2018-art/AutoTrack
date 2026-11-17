#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${APP_DIR}"

SKIP_INSTALL=0
SKIP_BUILD=0
START_SERVER=0
USE_DEV_MODE=0

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --start) START_SERVER=1 ;;
    --dev) USE_DEV_MODE=1 ;;
    --help|-h)
      cat <<'EOF'
Usage: ./scripts/uat_local_setup.sh [options]

Options:
  --skip-install   Skip npm ci / npm install
  --skip-build     Skip production build and smoke test
  --start          Start the server after all UAT checks pass
  --dev            With --start, run npm run dev instead of npm start
  -h, --help       Show this help message
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

echo ""
echo "=============================================================="
echo " AutoTrack Pro — Local Installation, DB Service Probe & UAT"
echo "=============================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Install Node.js 20+ and re-run." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed. Install Node.js 20+ (includes npm) and re-run." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "parseInt(process.versions.node.split('.')[0], 10)")"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  echo "ERROR: Node.js 20+ is required (found $(node -v))." >&2
  exit 1
fi
echo "[1/6] Runtime OK: Node $(node -v), npm $(npm -v)"

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    sed -E 's/^(GEMINI_API_KEY|APP_URL|TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN|TWILIO_PHONE_NUMBER|TWILIO_WHATSAPP_NUMBER|WHATSAPP_CLOUD_API_TOKEN|WHATSAPP_PHONE_NUMBER_ID)=/# \1=/' .env.example > .env
  else
    cat > .env <<'EOF'
PORT=3000
GEMINI_TEXT_MODEL="gemini-4-hydrogen"
GEMINI_AUDIO_MODEL="gemini-3.5-transcribe"
VALIDATE_GEMINI_MODELS_ON_START="false"
EOF
  fi
  echo "[2/6] Created .env with safe local UAT defaults (uncomment keys when ready)."
else
  echo "[2/6] Environment file ready (.env)."
fi

if [ "${SKIP_INSTALL}" -eq 1 ]; then
  echo "[3/6] Skipping dependency installation (--skip-install)."
else
  echo "[3/6] Installing Node dependencies locally..."
  if [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi
fi

echo "[4/6] Checking locally running database and sync services..."
node scripts/check_local_services.mjs

echo "[5/6] Running UAT code, SQL, and security checks..."
npm run lint
npm test
npm run validate:sql
npx eslint firestore.rules
npx tsx firestore.rules.test.ts

if [ "${SKIP_BUILD}" -eq 1 ]; then
  echo "[6/6] Skipping production build and smoke test (--skip-build)."
else
  echo "[6/6] Building production bundle and running smoke test..."
  npm run build
  npm run smoke
fi

echo ""
echo "UAT SETUP & SERVICE CHECKS PASSED."
echo " - Start Dev Server  : npm run dev"
echo " - Start Prod Server : npm start"
echo " - Local App URL     : http://localhost:${PORT:-3000}"
echo ""

if [ "${START_SERVER}" -eq 1 ]; then
  if [ "${USE_DEV_MODE}" -eq 1 ]; then
    echo "Launching local dev server on port ${PORT:-3000}..."
    exec npm run dev
  else
    echo "Launching local production UAT server on port ${PORT:-3000}..."
    exec npm start
  fi
fi
