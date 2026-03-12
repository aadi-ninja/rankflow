@echo off
echo ===================================================
echo Welcome to RankFlow - Your Viral Video Downloader
echo ===================================================
echo.
echo Installing requirements... please wait.
echo.

cd web
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies. Make sure Node.js is installed!
    pause
    exit /b %errorlevel%
)

echo.
echo Starting RankFlow...
echo Keep this window open!
echo.
echo Press Ctrl+C in this window to stop the application.
echo.
start http://localhost:3000
call npm run dev
pause
