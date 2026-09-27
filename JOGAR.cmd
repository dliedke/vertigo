@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js e execute este arquivo novamente.
  echo Voce tambem pode servir a pasta dist com qualquer servidor HTTP local.
  pause
  exit /b 1
)
node server.mjs --open
pause
