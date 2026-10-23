# Chay truc tiep test E2E o che do Headed Live quan sat tren man hinh
$env:PYTHONIOENCODING = "utf-8"
& "$PSScriptRoot\.venv\Scripts\pytest.exe" "$PSScriptRoot\ui\test_ui_verify_fe_bugfix_full.py" -s -v
