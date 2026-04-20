@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

if not exist "backend\requirements.txt" (
  echo [ERROR] Missing backend\requirements.txt
  exit /b 1
)

if not exist "frontend\package.json" (
  echo [ERROR] Missing frontend\package.json
  exit /b 1
)

call :detect_python

if not defined PYTHON_CMD (
  echo [INFO] Compatible Python 3.11 - 3.13 not found. Attempting installation...
  call :install_python_windows
  if errorlevel 1 goto :fail

  call :detect_python
  if not defined PYTHON_CMD (
    echo [ERROR] Unable to find Python 3.11 - 3.13 after installation attempt.
    echo Run "py -0p" and ensure Python 3.13 is installed.
    goto :fail
  )
)

for /f %%v in ('%PYTHON_CMD% -c "import sys; print(str(sys.version_info[0]) + '.' + str(sys.version_info[1]))"') do set "PY_VER=%%v"
for /f "tokens=1,2 delims=." %%a in ("%PY_VER%") do (
  set "PY_MAJOR=%%a"
  set "PY_MINOR=%%b"
)

if not "%PY_MAJOR%"=="3" (
  echo [ERROR] Python %PY_VER% detected. This project requires Python 3.11 - 3.13.
  exit /b 1
)

if %PY_MINOR% LSS 11 (
  echo [ERROR] Python %PY_VER% detected. This project requires Python 3.11 - 3.13.
  exit /b 1
)

if %PY_MINOR% GTR 13 (
  echo [ERROR] Python %PY_VER% detected. This project requires Python 3.11 - 3.13.
  goto :fail
)

echo Using Python %PY_VER% via: %PYTHON_CMD%

where npm >nul 2>&1
if errorlevel 1 (
  echo [INFO] npm not found. Attempting Node.js LTS installation...
  call :install_node_windows
  if errorlevel 1 goto :fail
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is still not available in PATH.
  echo Open a new terminal and rerun setup-production.bat.
  goto :fail
)

for /f %%v in ('node --version') do set "NODE_VER=%%v"
set "NODE_MAJOR=%NODE_VER:v=%"
for /f "tokens=1 delims=." %%a in ("%NODE_MAJOR%") do set "NODE_MAJOR=%%a"

if %NODE_MAJOR% LSS 20 (
  echo [INFO] Node.js %NODE_VER% detected. Upgrading to Node.js LTS...
  call :install_node_windows
  if errorlevel 1 goto :fail
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  for /f %%v in ('node --version') do set "NODE_VER=%%v"
)

for /f %%v in ('npm --version') do set "NPM_VER=%%v"
echo Using Node %NODE_VER% and npm %NPM_VER%

echo === Backend setup ===
set "VENV_PY=backend\.venv\Scripts\python.exe"

if exist "%VENV_PY%" (
  for /f %%v in ('%VENV_PY% -c "import sys; print(str(sys.version_info[0]) + '.' + str(sys.version_info[1]))"') do set "VENV_PY_VER=%%v"
  if not "!VENV_PY_VER!"=="%PY_VER%" (
    echo Existing backend\.venv uses Python !VENV_PY_VER!, recreating with %PY_VER% ...
    rmdir /s /q "backend\.venv"
  )
)

if not exist "%VENV_PY%" (
  echo Creating virtual environment in backend\.venv ...
  call %PYTHON_CMD% -m venv "backend\.venv"
  if errorlevel 1 goto :fail
)

echo Upgrading pip ...
call "%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 goto :fail

echo Installing backend dependencies ...
call "%VENV_PY%" -m pip install -r "backend\requirements.txt"
if errorlevel 1 goto :fail

echo === Frontend setup ===
pushd "frontend"
if exist "package-lock.json" (
  echo Installing frontend dependencies with npm ci ...
  call npm ci
  if errorlevel 1 (
    echo [WARN] npm ci failed, retrying with npm install --legacy-peer-deps ...
    call npm install --legacy-peer-deps
  )
) else (
  echo Installing frontend dependencies with npm install ...
  call npm install
  if errorlevel 1 (
    echo [WARN] npm install failed, retrying with npm install --legacy-peer-deps ...
    call npm install --legacy-peer-deps
  )
)
if errorlevel 1 (
  popd
  goto :fail
)

echo Building frontend for production ...
call npm run build
if errorlevel 1 (
  popd
  goto :fail
)
popd

echo.
echo Production setup completed successfully.
echo.
echo Next steps:
echo   1^) Start backend API:
echo      cd backend ^&^& .venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
echo   2^) Serve frontend dist with your web server from:
echo      frontend\dist

exit /b 0

:fail
echo.
echo [ERROR] Production setup failed.
exit /b 1

:detect_python
set "PYTHON_CMD="

where py >nul 2>&1
if !ERRORLEVEL! EQU 0 (
  for %%V in (3.13 3.12 3.11) do (
    py -%%V -c "import sys" >nul 2>&1
    if !ERRORLEVEL! EQU 0 if not defined PYTHON_CMD (
      set "PYTHON_CMD=py -%%V"
    )
  )
)

if defined PYTHON_CMD goto :eof

where python >nul 2>&1
if errorlevel 1 goto :eof

for /f %%v in ('python -c "import sys; print(str(sys.version_info[0]) + '.' + str(sys.version_info[1]))"') do set "SYS_PY_VER=%%v"
for /f "tokens=1,2 delims=." %%a in ("!SYS_PY_VER!") do (
  set "SYS_PY_MAJOR=%%a"
  set "SYS_PY_MINOR=%%b"
)

if "!SYS_PY_MAJOR!"=="3" if !SYS_PY_MINOR! GEQ 11 if !SYS_PY_MINOR! LEQ 13 (
  set "PYTHON_CMD=python"
)
goto :eof

:install_python_windows
where winget >nul 2>&1
if errorlevel 1 (
  echo [ERROR] winget is not available, cannot auto-install Python.
  echo Install Python 3.13 manually, then rerun this script.
  exit /b 1
)

echo [INFO] Installing Python 3.13 via winget ...
winget install --id Python.Python.3.13 --exact --silent --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo [ERROR] Failed to install Python 3.13 via winget.
  exit /b 1
)
exit /b 0

:install_node_windows
where winget >nul 2>&1
if errorlevel 1 (
  echo [ERROR] winget is not available, cannot auto-install Node.js.
  echo Install Node.js LTS manually, then rerun this script.
  exit /b 1
)

echo [INFO] Installing Node.js LTS via winget ...
winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo [ERROR] Failed to install Node.js via winget.
  exit /b 1
)
exit /b 0
