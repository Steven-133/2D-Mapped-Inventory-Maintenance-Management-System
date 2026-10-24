@echo off
title MRO Warehouse - Frontend (Vite + React)
echo ===================================================
echo   Starting MRO Warehouse Frontend
echo   Note: Ensure XAMPP Apache ^& MySQL are running!
echo ===================================================
echo.
cd /d "%~dp0jreact"
npm run dev
pause
