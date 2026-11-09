@echo off
rem Maya: one-click install on any Windows 10/11 PC.
rem Installs Ollama, downloads the newest Maya installer from GitHub (or uses one next to this file),
rem installs it, downloads the main AI models and starts Maya.
setlocal
cd /d "%~dp0"
title Install Maya
echo.
echo   =====  Installing Maya  =====
echo.

set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA%" (
  echo [1/5] Installing Ollama ^(the local AI engine^)...
  winget install --id Ollama.Ollama -e --silent --accept-package-agreements --accept-source-agreements
) else (
  echo [1/5] Ollama is already installed.
)
if not exist "%OLLAMA%" (
  echo     Could not install Ollama automatically. Install it from https://ollama.com/download and run this again.
  pause & exit /b 1
)
curl -s -o nul http://127.0.0.1:11434/api/version || start "" /min "%OLLAMA%" serve

set "SETUP="
for %%f in ("%~dp0Maya-Setup-*.exe") do set "SETUP=%%~ff"
if not defined SETUP (
  echo [2/5] Downloading the newest Maya from GitHub...
  powershell -NoProfile -Command "$r = Invoke-RestMethod https://api.github.com/repos/Achu226/ather/releases/latest; $a = $r.assets | Where-Object name -like 'Maya-Setup-*.exe' | Select-Object -First 1; Invoke-WebRequest $a.browser_download_url -OutFile (Join-Path $env:TEMP $a.name); Write-Output (Join-Path $env:TEMP $a.name)" > "%TEMP%\ather-setup-path.txt" || goto :fail
  set /p SETUP=<"%TEMP%\ather-setup-path.txt"
) else (
  echo [2/5] Using %SETUP%
)

echo [3/5] Installing Maya...
start /wait "" "%SETUP%" /S || goto :fail

echo [4/5] Downloading the AI brain ^(about 3.5 GB, one time^)...
"%OLLAMA%" pull qwen3.5:4b || goto :fail
"%OLLAMA%" pull nomic-embed-text
echo     Optional: the smart 9B model ^(6.6 GB^) can be downloaded later from Maya's Settings - AI models.

echo [5/5] Starting Maya - its setup screen downloads the voice and image models.
rem The install folder keeps the package name "ather"; the app inside is Maya.exe.
start "" "%LOCALAPPDATA%\Programs\ather\Maya.exe"
echo.
echo Done! Move your mouse to the top of the screen or press Ctrl+Space to talk to Maya.
pause
exit /b 0

:fail
echo.
echo Installation failed. Check your internet connection and run install.bat again.
pause
exit /b 1
