@echo off
rem Maya: run from the source folder. Installs whatever is missing (Node.js, Ollama, libraries, AI models), then starts.
setlocal
cd /d "%~dp0"
title Maya
echo.
echo   =====  Maya - your computer's little buddy  =====
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [1/5] Node.js is missing - installing Node.js LTS...
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
) else (
  echo [1/5] Node.js found.
)
where node >nul 2>nul || goto :fail

set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA%" (
  where ollama >nul 2>nul
  if errorlevel 1 (
    echo [2/5] Ollama is missing - installing Ollama...
    winget install --id Ollama.Ollama -e --silent --accept-package-agreements --accept-source-agreements
  )
)
echo [2/5] Starting the Ollama AI server...
curl -s -o nul http://127.0.0.1:11434/api/version || start "" /min "%OLLAMA%" serve
timeout /t 3 /nobreak >nul

if not exist node_modules (
  echo [3/5] Installing Maya's libraries ^(first run only, a few minutes^)...
  call npm install --no-audit --no-fund || goto :fail
) else (
  echo [3/5] Libraries found.
)

echo [4/5] Checking AI models ^(the first run downloads about 10 GB^)...
call node scripts\fetch-models.js || echo     Some models could not be downloaded now; Maya's setup screen can retry.

echo [5/5] Building and starting Maya...
call npx vite build --logLevel error || goto :fail
call npx electron .
exit /b 0

:fail
echo.
echo Maya could not start. Check your internet connection and try again.
pause
exit /b 1
