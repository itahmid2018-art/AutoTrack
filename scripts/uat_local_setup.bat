@echo off
setlocal EnableExtensions EnableDelayedExpansion

pushd "%~dp0\.." >nul 2>&1
if errorlevel 1 (
  echo ERROR: Unable to resolve repository root directory.
  exit /b 1
)

set "SKIP_INSTALL=0"
set "SKIP_BUILD=0"
set "START_SERVER=0"
set "USE_DEV_MODE=0"

:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--skip-install" set "SKIP_INSTALL=1"
if /I "%~1"=="/skip-install" set "SKIP_INSTALL=1"
if /I "%~1"=="--skip-build" set "SKIP_BUILD=1"
if /I "%~1"=="/skip-build" set "SKIP_BUILD=1"
if /I "%~1"=="--start" set "START_SERVER=1"
if /I "%~1"=="/start" set "START_SERVER=1"
if /I "%~1"=="--dev" set "USE_DEV_MODE=1"
if /I "%~1"=="/dev" set "USE_DEV_MODE=1"
if /I "%~1"=="--help" goto :show_help
if /I "%~1"=="-h" goto :show_help
if /I "%~1"=="/?" goto :show_help
shift
goto :parse_args

:show_help
echo Usage: scripts\uat_local_setup.bat [options]
echo.
echo Options:
echo   --skip-install   Skip npm ci / npm install
echo   --skip-build     Skip production build and smoke test
echo   --start          Start the local server after all UAT checks pass
echo   --dev            With --start, run npm run dev instead of npm start
popd >nul 2>&1
exit /b 0

:args_done
echo.
echo ==============================================================
echo  AutoTrack Pro - Local Installation, DB Service Probe and UAT
echo ==============================================================

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Install Node.js 20+ and re-run.
  goto :fail
)
where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm is not installed. Install Node.js 20+ and re-run.
  goto :fail
)

for /f %%v in ('node -p "parseInt(process.versions.node.split('.')[0], 10)"') do set "NODE_MAJOR=%%v"
if !NODE_MAJOR! LSS 20 (
  echo ERROR: Node.js 20+ is required.
  node -v
  goto :fail
)
for /f %%v in ('node -v') do set "NODE_VER=%%v"
for /f %%v in ('call npm -v') do set "NPM_VER=%%v"
echo [1/6] Runtime OK: Node !NODE_VER!, npm !NPM_VER!

if not exist ".env" (
  (
    echo PORT=3000
    echo GEMINI_TEXT_MODEL="gemini-4-hydrogen"
    echo GEMINI_AUDIO_MODEL="gemini-3.5-transcribe"
    echo VALIDATE_GEMINI_MODELS_ON_START="false"
    echo # GEMINI_API_KEY="your_gemini_api_key_here"
    echo # TWILIO_ACCOUNT_SID=""
    echo # TWILIO_AUTH_TOKEN=""
    echo # TWILIO_PHONE_NUMBER=""
    echo # TWILIO_WHATSAPP_NUMBER=""
    echo # WHATSAPP_CLOUD_API_TOKEN=""
    echo # WHATSAPP_PHONE_NUMBER_ID=""
  ) > .env
  echo [2/6] Created .env with safe local UAT defaults. Uncomment keys when ready.
) else (
  echo [2/6] Environment file ready (.env^).
)

if "%SKIP_INSTALL%"=="1" (
  echo [3/6] Skipping dependency installation (--skip-install^).
) else (
  echo [3/6] Installing Node dependencies locally...
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 goto :fail
)

echo [4/6] Checking locally running database and sync services...
call node scripts/check_local_services.mjs
if errorlevel 1 goto :fail

echo [5/6] Running UAT code, SQL, and security checks...
call npm run lint
if errorlevel 1 goto :fail
call npm test
if errorlevel 1 goto :fail
call npm run validate:sql
if errorlevel 1 goto :fail
call npx eslint firestore.rules
if errorlevel 1 goto :fail
call npx tsx firestore.rules.test.ts
if errorlevel 1 goto :fail

if "%SKIP_BUILD%"=="1" (
  echo [6/6] Skipping production build and smoke test (--skip-build^).
) else (
  echo [6/6] Building production bundle and running smoke test...
  call npm run build
  if errorlevel 1 goto :fail
  call npm run smoke
  if errorlevel 1 goto :fail
)

echo.
echo UAT SETUP AND SERVICE CHECKS PASSED.
echo  - Start Dev Server  : npm run dev
echo  - Start Prod Server : npm start
echo  - Local App URL     : http://localhost:3000
echo.

if "%START_SERVER%"=="1" (
  if "%USE_DEV_MODE%"=="1" (
    echo Launching local dev server on port 3000...
    call npm run dev
  ) else (
    echo Launching local production UAT server on port 3000...
    call npm start
  )
  if errorlevel 1 goto :fail
)

popd >nul 2>&1
exit /b 0

:fail
echo.
echo ERROR: Local setup or UAT check failed. Review the output above.
popd >nul 2>&1
exit /b 1
