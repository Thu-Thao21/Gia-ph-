<#
.SYNOPSIS
  Chạy Frontend (Vite) tại http://localhost:5173. Dừng: Ctrl+C. Backend phải đang chạy (run_be.ps1).
#>
$ErrorActionPreference = 'Stop'
$FeDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'FE'
if (-not (Test-Path (Join-Path $FeDir 'node_modules'))) {
    Write-Host '[LỖI] Chưa cài thư viện FE. Chạy trước: powershell -ExecutionPolicy Bypass -File scripts\setup_tester.ps1' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $FeDir '.env'))) {
    Write-Host '[LỖI] Chưa có FE\.env. Chạy trước scripts\setup_tester.ps1' -ForegroundColor Red
    exit 1
}
if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) {
    Write-Host '[CẢNH BÁO] Cổng 5173 đang được dùng: Vite sẽ chọn cổng khác (xem địa chỉ "Local:" bên dưới).' -ForegroundColor Yellow
    Write-Host '           Khi đó Backend sẽ chặn CORS; nên đóng FE đang chạy rồi chạy lại.' -ForegroundColor Yellow
}
Set-Location $FeDir
Write-Host 'Frontend: http://localhost:5173' -ForegroundColor Cyan
& npm run dev
exit $LASTEXITCODE
