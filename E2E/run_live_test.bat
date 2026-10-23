@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
echo ========================================================
echo   KICH HOAT HEADED LIVE TEST E2E (CHROME FULLSCREEN)
echo ========================================================
"%~dp0.venv\Scripts\pytest.exe" "%~dp0ui\test_ui_verify_fe_bugfix_full.py" -s -v
pause
