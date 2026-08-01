@echo off
title Material Downloader v3 - Native Desktop App
echo Starting Material Downloader v3 Native Desktop Application...
cd /d "%~dp0"

:: Start local app server in background
start /b node src/server/appServer.js >nul 2>&1
timeout /t 1 /nobreak >nul

:: Launch Native Neutralino Desktop Application
start bin\neutralino-win_x64.exe
