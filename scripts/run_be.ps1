<#
.SYNOPSIS
  Chạy Backend (FastAPI) tại http://127.0.0.1:8001 với BE\.venv. Dừng: Ctrl+C.
  --reload: tự nạp lại khi sửa code; trên Windows chế độ này dùng SelectorEventLoop (psycopg cần).
#>
$ErrorActionPreference = 'Stop'
$BeDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'BE'
$venvPy = Join-Path $BeDir '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) {
    Write-Host '[LỖI] Chưa có BE\.venv. Chạy trước: powershell -ExecutionPolicy Bypass -File scripts\setup_tester.ps1' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $BeDir '.env'))) {
    Write-Host '[LỖI] Chưa có BE\.env. Chạy trước scripts\setup_tester.ps1' -ForegroundColor Red
    exit 1
}
$busy = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Host "[LỖI] Cổng 8001 đang được dùng (PID $(@($busy)[0].OwningProcess)): có thể Backend đã chạy ở cửa sổ khác." -ForegroundColor Red
    Write-Host '      Dùng luôn Backend đó, hoặc đóng cửa sổ của nó rồi chạy lại.' -ForegroundColor Red
    exit 1
}
Set-Location $BeDir
$env:VIRTUAL_ENV = Join-Path $BeDir '.venv'
$env:PATH = (Join-Path $BeDir '.venv\Scripts') + ';' + $env:PATH
Write-Host 'Backend: http://127.0.0.1:8001  (kiểm tra: http://127.0.0.1:8001/api/health/ready)' -ForegroundColor Cyan
& $venvPy -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
exit $LASTEXITCODE
