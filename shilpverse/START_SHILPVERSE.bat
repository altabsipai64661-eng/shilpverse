@echo off
setlocal EnableExtensions
cd /d "%~dp0backend"
title ShilpVerse Launcher

echo.
echo ========================================
echo          SHILPVERSE MARKETPLACE
echo ========================================
echo.

set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY where python >nul 2>&1 && set "PY=python"

if not defined PY (
  echo ERROR: Python was not found.
  echo Install Python 3 and enable "Add Python to PATH", then run this file again.
  pause
  exit /b 1
)

echo Checking Python and Flask...
%PY% -c "import flask, flask_cors" >nul 2>&1
if errorlevel 1 (
  echo Flask is not installed. Installing required packages...
  %PY% -m pip install -r requirements.txt
  if errorlevel 1 (
    echo.
    echo ERROR: Dependencies could not be installed.
    echo Check your internet connection and try again.
    pause
    exit /b 1
  )
)

REM Start Flask in a separate terminal and wait until it is actually ready.
echo Starting ShilpVerse backend...
start "ShilpVerse Backend" cmd /k "cd /d "%~dp0backend" && %PY% app.py"

echo Waiting for the server to become ready...
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 30;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5000/api/health' -TimeoutSec 2;if($r.StatusCode -eq 200){$ok=$true;break}}catch{};Start-Sleep -Milliseconds 500}; if($ok){Start-Process 'http://127.0.0.1:5000'}else{Write-Host 'ERROR: Flask did not start on port 5000.' -ForegroundColor Red;Write-Host 'Check the ShilpVerse Backend window for the error.' -ForegroundColor Yellow;exit 1}"

if errorlevel 1 (
  echo.
  echo The backend did not start. Keep the backend window open and check its error message.
  pause
  exit /b 1
)

echo.
echo ShilpVerse is running at http://127.0.0.1:5000
endlocal
exit /b 0
