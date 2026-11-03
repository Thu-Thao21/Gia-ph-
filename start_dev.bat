@echo off
title Multi-Family Genealogy Dev Launcher
echo ======================================================
echo   Khoi dong Multi-Family Genealogy (Dev Environment)
echo ======================================================
echo.

echo [1/2] Dang khoi chay Backend tai http://localhost:8001 ...
start "MFG Backend (FastAPI)" cmd /k "cd /d %~dp0BE && python run_server.py"

echo [2/2] Dang khoi chay Frontend tai http://localhost:5173 ...
start "MFG Frontend (Vite)" cmd /k "cd /d %~dp0FE && npm run dev"

echo.
echo ======================================================
echo   Ca hai dich vu dang chay trong cac cua so rieng biet:
echo   - Backend API:  http://localhost:8001
echo   - Swagger Docs: http://localhost:8001/docs
echo   - Frontend:     http://localhost:5173
echo ======================================================
echo.
pause

