@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"

set "BACKEND_DIR=%ROOT_DIR%\backend"
set "FRONTEND_DIR=%ROOT_DIR%\frontend"

if not defined BACKEND_PORT set "BACKEND_PORT=8000"
if not defined FRONTEND_PORT set "FRONTEND_PORT=5173"

set "SKIP_INSTALL=0"
set "NO_START=0"
set "SELECTED_PY_CMD="
set "SELECTED_PY_VERSION="

:parse_args
if "%~1"=="" goto args_done

if /I "%~1"=="--skip-install" (
  set "SKIP_INSTALL=1"
  shift
  goto parse_args
)

if /I "%~1"=="--no-start" (
  set "NO_START=1"
  shift
  goto parse_args
)

if /I "%~1"=="--help" goto show_help
if /I "%~1"=="-h" goto show_help

echo [dev][error] Unknown option: %~1
exit /b 1

:show_help
echo Usage: scripts\dev-start.bat [options]
echo.
echo Options:
echo   --skip-install  Skip dependency installation steps
echo   --no-start      Run setup checks only; do not start services
echo   -h, --help      Show this help text
echo.
echo Environment variables:
echo   BACKEND_PORT    Backend API port ^(default: 8000^)
echo   FRONTEND_PORT   Frontend Vite port ^(default: 5173^)
exit /b 0

:args_done

where npm >nul 2>&1
if errorlevel 1 (
  echo [dev][error] npm is required but was not found in PATH.
  exit /b 1
)

if not exist "%BACKEND_DIR%" (
  echo [dev][error] Backend directory not found: %BACKEND_DIR%
  exit /b 1
)

if not exist "%FRONTEND_DIR%" (
  echo [dev][error] Frontend directory not found: %FRONTEND_DIR%
  exit /b 1
)

where py >nul 2>&1
if not errorlevel 1 (
  call :try_py_launcher 3.13
  if not defined SELECTED_PY_CMD call :try_py_launcher 3.12
  if not defined SELECTED_PY_CMD call :try_py_launcher 3.11
)

if not defined SELECTED_PY_CMD (
  where python >nul 2>&1
  if not errorlevel 1 (
    set "SYSTEM_PY_VERSION="
    for /f %%V in ('python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2^>nul') do set "SYSTEM_PY_VERSION=%%V"
    if defined SYSTEM_PY_VERSION (
      call :is_supported_version "!SYSTEM_PY_VERSION!"
      if not errorlevel 1 (
        set "SELECTED_PY_CMD=python"
        set "SELECTED_PY_VERSION=!SYSTEM_PY_VERSION!"
      )
    )
  )
)

if not defined SELECTED_PY_CMD (
  echo [dev][error] Python 3.11, 3.12, or 3.13 is required for backend dependencies.
  where python >nul 2>&1
  if not errorlevel 1 (
    for /f %%V in ('python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2^>nul') do (
      echo [dev][error] Detected default python %%V, which is unsupported by current backend pins.
    )
  )
  echo [dev][error] Install Python 3.12 ^(recommended^) and rerun this script.
  exit /b 1
)

echo [dev] Using Python !SELECTED_PY_VERSION! for backend environment.

set "VENV_PY=%BACKEND_DIR%\.venv\Scripts\python.exe"
if exist "%VENV_PY%" (
  set "VENV_VERSION="
  set "VENV_VERSION_RAW="
  if exist "%BACKEND_DIR%\.venv\pyvenv.cfg" (
    for /f "tokens=3 delims= " %%V in ('findstr /b /c:"version = " "%BACKEND_DIR%\.venv\pyvenv.cfg" 2^>nul') do set "VENV_VERSION_RAW=%%V"
    if defined VENV_VERSION_RAW (
      for /f "tokens=1,2 delims=." %%A in ("!VENV_VERSION_RAW!") do set "VENV_VERSION=%%A.%%B"
    )
  )
  call :is_supported_version "!VENV_VERSION!"
  if errorlevel 1 (
    if defined VENV_VERSION (
      echo [dev] Existing backend virtual environment uses unsupported Python !VENV_VERSION!; recreating...
    ) else (
      echo [dev] Existing backend virtual environment could not be inspected; recreating...
    )
    rmdir /s /q "%BACKEND_DIR%\.venv"
    if exist "%BACKEND_DIR%\.venv" (
      echo [dev][error] Failed to remove incompatible backend virtual environment.
      exit /b 1
    )
  )
)

if not exist "%VENV_PY%" (
  echo [dev] Creating backend virtual environment with Python !SELECTED_PY_VERSION!...
  pushd "%BACKEND_DIR%"
  %SELECTED_PY_CMD% -m venv .venv
  if errorlevel 1 (
    popd
    echo [dev][error] Failed to create backend virtual environment.
    exit /b 1
  )
  popd
)

if "%SKIP_INSTALL%"=="0" (
  echo [dev] Installing backend dependencies...
  "%BACKEND_DIR%\.venv\Scripts\python.exe" -m pip install --upgrade pip
  if errorlevel 1 exit /b 1
  "%BACKEND_DIR%\.venv\Scripts\python.exe" -m pip install -r "%BACKEND_DIR%\requirements.txt"
  if errorlevel 1 exit /b 1

  if not exist "%FRONTEND_DIR%\node_modules" (
    echo [dev] Installing frontend dependencies...
    pushd "%FRONTEND_DIR%"
    npm ci
    if errorlevel 1 (
      echo [dev] npm ci failed; retrying with npm install --legacy-peer-deps...
      npm install --legacy-peer-deps
      if errorlevel 1 (
        popd
        exit /b 1
      )
    )
    popd
  )
) else (
  echo [dev] Skipping dependency installation
)

if not exist "%BACKEND_DIR%\.env" (
  if exist "%BACKEND_DIR%\.env.example" (
    copy "%BACKEND_DIR%\.env.example" "%BACKEND_DIR%\.env" >nul
    echo [dev] Created backend .env from .env.example
  )
)

if "%NO_START%"=="1" (
  echo [dev] Setup complete. --no-start requested; exiting without launching services.
  exit /b 0
)

echo [dev] Starting backend on http://localhost:%BACKEND_PORT%
start "Network Platform Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && "".venv\Scripts\python.exe"" -m uvicorn main:app --reload --host 0.0.0.0 --port %BACKEND_PORT%"

echo [dev] Starting frontend on http://localhost:%FRONTEND_PORT%
start "Network Platform Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev -- --host 0.0.0.0 --port %FRONTEND_PORT%"

echo [dev] Development servers started in separate windows.
echo [dev] Close those windows or press Ctrl+C in them to stop services.

exit /b 0

:try_py_launcher
if defined SELECTED_PY_CMD exit /b 0
set "CANDIDATE_VERSION=%~1"
py -%CANDIDATE_VERSION% -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" >nul 2>&1
if errorlevel 1 exit /b 0
set "SELECTED_PY_CMD=py -%CANDIDATE_VERSION%"
set "SELECTED_PY_VERSION=%CANDIDATE_VERSION%"
exit /b 0

:is_supported_version
if "%~1"=="3.11" exit /b 0
if "%~1"=="3.12" exit /b 0
if "%~1"=="3.13" exit /b 0
exit /b 1
