@echo off
rem Double-click to start Chat World. Keep this window open while streaming.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS from https://nodejs.org & pause & exit /b 1)
start "" /b cmd /c "timeout /t 2 >nul & start http://127.0.0.1:7272/dashboard.html"
node server.js %*
pause
