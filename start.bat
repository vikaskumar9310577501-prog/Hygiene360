@echo off
title HYGIENE 360 - Backend + Frontend
cd /d "%~dp0"

echo ======================================================
echo    HYGIENE 360 - Starting Backend and Frontend
echo ======================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

echo [1/3] Stopping old servers on ports 5000, 3000-3005 ...
for %%P in (5000 3000 3001 3002 3003 3004 3005) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P  *[0-9.:\[\]]*  *LISTENING"') do (
    taskkill /F /PID %%A >nul 2>&1
  )
)

echo [2/3] Checking packages ...
if not exist "node_modules" (
  echo       Installing backend packages...
  call npm install
)
if not exist "client\node_modules" (
  echo       Installing frontend packages...
  call npm --prefix client install
)

echo [3/3] Starting servers ...
echo.
echo   Backend  : http://localhost:5000/api/health
echo   Frontend : https://localhost:3000
echo   Phone    : use the "Network: https://..." link shown below (same Wi-Fi)
echo.
echo   Keep this window open. Closing it stops the software.
echo ======================================================
echo.

start "" cmd /c "timeout /t 10 /nobreak >nul & start https://localhost:3000"

call npm run dev

echo.
echo Servers stopped.
pause
