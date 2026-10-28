<#
.SYNOPSIS
  Mở hai cửa sổ PowerShell: Backend (run_be.ps1) và Frontend (run_fe.ps1). Đóng cửa sổ để dừng.
#>
$ErrorActionPreference = 'Stop'
$shell = (Get-Process -Id $PID).Path  # cùng loại PowerShell đang dùng (powershell.exe hoặc pwsh.exe)
foreach ($name in @('run_be.ps1', 'run_fe.ps1')) {
    $script = Join-Path $PSScriptRoot $name
    Start-Process -FilePath $shell -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$script`"")
}
Write-Host 'Đã mở 2 cửa sổ: Backend http://127.0.0.1:8001 và Frontend http://localhost:5173' -ForegroundColor Green
Write-Host 'Chờ Backend báo "Application startup complete" rồi mở http://localhost:5173' -ForegroundColor Green
