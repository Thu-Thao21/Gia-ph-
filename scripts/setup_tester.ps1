<#
.SYNOPSIS
  Cài đặt môi trường cho tester (chạy từ thư mục gốc repo). Chạy lại nhiều lần không hỏng.

.DESCRIPTION
  1. Kiểm tra Python (3.11+, khuyên dùng 3.13) và Node.js (18+) / npm.
  2. BE: tạo BE\.venv nếu chưa có, cài requirements-dev.txt (ghim bằng constraints.txt).
  3. FE: npm ci (hoặc npm install nếu không có package-lock.json).
  4. Tạo BE\.env và FE\.env từ .env.example NẾU CHƯA CÓ (không bao giờ ghi đè):
     APP_ENV=dev, ALLOW_GMAIL_PLUS_ALIAS=true, OTP_HMAC_KEY ngẫu nhiên (96 ký tự hex),
     giá trị từ "gói bí mật" trong secrets\ (be.env + tệp *.json service account),
     DEV_DATABASE_HOSTS lấy từ host của DATABASE_URL.
     Với -FillMissing: chỉ ĐIỀN các ô còn trống / còn giá trị mẫu trong BE\.env đã có
     (có sao lưu BE\.env.bak-<thời gian>), không đổi giá trị bạn đã đặt.
  5. Chạy BE\scripts\check_env.py (chỉ đọc, che bí mật).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup_tester.ps1
  powershell -ExecutionPolicy Bypass -File scripts\setup_tester.ps1 -FillMissing
  powershell -ExecutionPolicy Bypass -File scripts\setup_tester.ps1 -SkipInstall -SkipDb
#>
[CmdletBinding()]
param(
    [switch]$FillMissing,   # điền các ô trống của BE\.env đã có từ secrets\ (có sao lưu)
    [switch]$SkipInstall,   # bỏ qua pip / npm (chỉ làm .env + kiểm tra)
    [switch]$SkipDb,        # check_env không kết nối DB
    [switch]$SkipSmtp       # check_env không thử SMTP
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$BeDir = Join-Path $Root 'BE'
$FeDir = Join-Path $Root 'FE'
$SecretsDir = Join-Path $Root 'secrets'
$ProdEndpoint = 'ep-green-mode-b4ugmgu4'
$DevEndpoint = 'ep-patient-term-b4dlkr06'
$Placeholder = '(?i)^$|your[_-]|change-me|/path/to/|USER:PASSWORD@HOST|<[^>]+>'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Info($text) { Write-Host "    $text" }
function Good($text) { Write-Host "    [OK] $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    [CẢNH BÁO] $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "`n[LỖI] $text" -ForegroundColor Red; exit 1 }

function Read-EnvFile($path) {
    $map = [ordered]@{}
    if (Test-Path $path) {
        foreach ($line in [System.IO.File]::ReadAllLines($path)) {
            $t = $line.Trim()
            if ($t -eq '' -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
            $i = $t.IndexOf('=')
            $map[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
        }
    }
    return $map
}

function Set-EnvLine([System.Collections.Generic.List[string]]$lines, $key, $value) {
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*$([regex]::Escape($key))\s*=") { $lines[$i] = "$key=$value"; return }
    }
    $lines.Add("$key=$value")
}

function Get-DbHost($url) {
    if ($url -match '@([^/:?@]+)') { return $Matches[1].ToLower() }
    return ''
}

function Get-Endpoint($dbHost) { return ($dbHost.Split('.')[0] -replace '-pooler$', '') }

function New-HexKey {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })   # 96 ký tự hex
}

function Find-Python {
    $candidates = @(@('py', '-3.13'), @('py', '-3.12'), @('py', '-3.11'), @('python'), @('python3'))
    foreach ($c in $candidates) {
        $exe = $c[0]; $extra = @($c | Select-Object -Skip 1)
        if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { continue }
        try {
            $ver = & $exe @extra -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
        } catch { continue }
        if ($LASTEXITCODE -ne 0 -or -not $ver) { continue }
        $parts = $ver.Trim().Split('.')
        if ([int]$parts[0] -eq 3 -and [int]$parts[1] -ge 11) {
            return @{ Exe = $exe; Args = $extra; Version = $ver.Trim() }
        }
    }
    return $null
}

# ---------------------------------------------------------------- 1. công cụ
Step 'Kiểm tra Python và Node.js'
$py = Find-Python
if (-not $py) {
    Fail "Không tìm thấy Python 3.11+ (dự án dùng 3.13). Cài từ https://www.python.org/downloads/ (tick 'Add python.exe to PATH'), mở lại PowerShell rồi chạy lại."
}
Good "Python $($py.Version) ($($py.Exe) $($py.Args -join ' '))"
if ($py.Version -ne '3.13') { Warn "Dự án được kiểm thử trên Python 3.13; bản $($py.Version) thường vẫn chạy được." }

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail "Không tìm thấy Node.js / npm. Cài Node.js 20 LTS từ https://nodejs.org/ rồi mở lại PowerShell."
}
$nodeVer = (& node --version).TrimStart('v')
if ([int]$nodeVer.Split('.')[0] -lt 18) { Fail "Node.js $nodeVer quá cũ: cần 18+ (khuyên 20 LTS)." }
Good "Node.js $nodeVer, npm $(& npm --version)"

# ---------------------------------------------------------------- 2. secrets\ không bị git theo dõi
Step 'Kiểm tra thư mục secrets\ (gói bí mật)'
if (-not (Test-Path $SecretsDir)) { New-Item -ItemType Directory -Path $SecretsDir | Out-Null }
if (Get-Command git -ErrorAction SilentlyContinue) {
    $tracked = @(); $notIgnored = @(); $gitOk = $false
    Push-Location $Root
    try {
        $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        $null = & git rev-parse --is-inside-work-tree 2>$null
        if ($LASTEXITCODE -eq 0) {
            $gitOk = $true
            $tracked = @(& git ls-files -- secrets 2>$null | Where-Object { $_ })
            $notIgnored = @(& git ls-files --others --exclude-standard -- secrets 2>$null | Where-Object { $_ })
        }
    } catch { $gitOk = $false } finally { $ErrorActionPreference = $prev; Pop-Location }
    if (-not $gitOk) { Warn 'Thư mục này không phải repo git: bỏ qua kiểm tra secrets\ bằng git (đừng sao chép secrets\ vào repo).' }
    elseif ($tracked.Count -gt 0) { Fail "Có tệp trong secrets\ đang bị git theo dõi: $($tracked -join ', '). Gỡ ngay: git rm --cached <tệp>." }
    if ($gitOk -and $notIgnored.Count -gt 0) { Fail "secrets\ chưa được .gitignore bỏ qua ($($notIgnored.Count) tệp). Kiểm tra .gitignore ở gốc repo." }
    if ($gitOk) { Good 'secrets\ được .gitignore bỏ qua, không tệp nào bị git theo dõi' }
}
$secretEnv = Read-EnvFile (Join-Path $SecretsDir 'be.env')
$saFiles = @(Get-ChildItem -Path $SecretsDir -Filter '*.json' -File -ErrorAction SilentlyContinue)
if ($secretEnv.Count -gt 0) { Good "secrets\be.env: $($secretEnv.Count) biến ($(@($secretEnv.Keys) -join ', '))" } else { Info 'Chưa có secrets\be.env (gói bí mật Minh gửi riêng).' }
if ($saFiles.Count -eq 1) { Good "Tệp service account: secrets\$($saFiles[0].Name)" }
elseif ($saFiles.Count -gt 1) { Warn "Có $($saFiles.Count) tệp .json trong secrets\: chỉ để lại MỘT tệp service account." }
else { Info 'Chưa có tệp Firebase service account (*.json) trong secrets\.' }

if ($secretEnv.Contains('DATABASE_URL')) {
    $ep = Get-Endpoint (Get-DbHost $secretEnv['DATABASE_URL'])
    if ($ep -eq $ProdEndpoint) { Fail "DATABASE_URL trong secrets\be.env trỏ PRODUCTION ($ProdEndpoint). Dừng: không dùng production để test." }
}

# ---------------------------------------------------------------- 3. cài phụ thuộc
$venvPy = Join-Path $BeDir '.venv\Scripts\python.exe'
if ($SkipInstall) {
    Step 'Bỏ qua cài phụ thuộc (-SkipInstall)'
} else {
    Step 'BE: môi trường Python (BE\.venv) và thư viện'
    if (-not (Test-Path $venvPy)) {
        & $py.Exe @($py.Args) -m venv (Join-Path $BeDir '.venv')
        if ($LASTEXITCODE -ne 0) { Fail 'Không tạo được BE\.venv.' }
        Good 'Đã tạo BE\.venv'
    } else { Good 'BE\.venv đã có' }
    Push-Location $BeDir
    $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'  # pip/npm ghi cảnh báo ra stderr
    try {
        & $venvPy -m pip install --disable-pip-version-check -q -r requirements-dev.txt -c constraints.txt
        if ($LASTEXITCODE -ne 0) { Fail 'pip install thất bại (xem lỗi ở trên). Kiểm tra mạng rồi chạy lại.' }
    } finally { Pop-Location; $ErrorActionPreference = $prevEap }
    Good 'Đã cài thư viện BE (phiên bản ghim trong constraints.txt)'

    Step 'FE: thư viện Node (npm)'
    Push-Location $FeDir
    $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        if (Test-Path 'package-lock.json') { & npm ci --no-audit --no-fund } else { & npm install --no-audit --no-fund }
        if ($LASTEXITCODE -ne 0) { Fail 'npm ci / npm install thất bại (xem lỗi ở trên).' }
    } finally { Pop-Location; $ErrorActionPreference = $prevEap }
    Good 'Đã cài thư viện FE'
}

# ---------------------------------------------------------------- 4. BE\.env
Step 'BE\.env'
$beEnv = Join-Path $BeDir '.env'
$beExample = Join-Path $BeDir '.env.example'

# Giá trị muốn có: từ gói bí mật + giá trị dev cho tester.
$wanted = [ordered]@{}
foreach ($k in $secretEnv.Keys) { $wanted[$k] = $secretEnv[$k] }
if ($saFiles.Count -eq 1) { $wanted['FIREBASE_SERVICE_ACCOUNT_PATH'] = "../secrets/$($saFiles[0].Name)" }  # tính từ thư mục BE
$devDefaults = [ordered]@{
    'APP_ENV' = 'dev'
    'ALLOW_GMAIL_PLUS_ALIAS' = 'true'
    'OTP_HMAC_KEY' = (New-HexKey)
    'FRONTEND_ORIGINS' = 'http://localhost:5173,http://127.0.0.1:5173'
    'FRONTEND_URL' = 'http://localhost:5173'
    'FRONTEND_BASE_URL' = 'http://localhost:5173'
}

function Add-DevHosts($map, $databaseUrl) {
    $dbHost = Get-DbHost $databaseUrl
    if ($dbHost -and $databaseUrl -notmatch $Placeholder) {
        $map['DEV_DATABASE_HOSTS'] = "localhost,127.0.0.1,::1,$(Get-Endpoint $dbHost)"
    }
}

if (-not (Test-Path $beEnv)) {
    $lines = New-Object 'System.Collections.Generic.List[string]'
    foreach ($l in [System.IO.File]::ReadAllLines($beExample)) { $lines.Add($l) }
    foreach ($k in $devDefaults.Keys) { Set-EnvLine $lines $k $devDefaults[$k] }
    foreach ($k in $wanted.Keys) { Set-EnvLine $lines $k $wanted[$k] }
    $dbUrl = $(if ($wanted.Contains('DATABASE_URL')) { $wanted['DATABASE_URL'] } else { '' })
    $hosts = [ordered]@{}; Add-DevHosts $hosts $dbUrl
    foreach ($k in $hosts.Keys) { Set-EnvLine $lines $k $hosts[$k] }
    [System.IO.File]::WriteAllLines($beEnv, $lines, $Utf8NoBom)
    Good 'Đã tạo BE\.env từ BE\.env.example (APP_ENV=dev, ALLOW_GMAIL_PLUS_ALIAS=true, OTP_HMAC_KEY mới)'
    if (-not $wanted.Contains('DATABASE_URL')) { Warn 'BE\.env chưa có DATABASE_URL thật: đặt secrets\be.env rồi chạy lại với -FillMissing.' }
} elseif ($FillMissing) {
    $current = Read-EnvFile $beEnv
    $lines = New-Object 'System.Collections.Generic.List[string]'
    foreach ($l in [System.IO.File]::ReadAllLines($beEnv)) { $lines.Add($l) }
    $fill = [ordered]@{}
    foreach ($k in $wanted.Keys) { $fill[$k] = $wanted[$k] }
    foreach ($k in $devDefaults.Keys) { if (-not $current.Contains($k) -or $current[$k] -match $Placeholder) { $fill[$k] = $devDefaults[$k] } }
    $dbUrl = $(if ($current.Contains('DATABASE_URL') -and $current['DATABASE_URL'] -notmatch $Placeholder) { $current['DATABASE_URL'] } elseif ($wanted.Contains('DATABASE_URL')) { $wanted['DATABASE_URL'] } else { '' })
    $ep = Get-Endpoint (Get-DbHost $dbUrl)
    if ($ep -eq $ProdEndpoint) { Fail "DATABASE_URL trỏ PRODUCTION ($ProdEndpoint). Dừng." }
    $hostsWanted = [ordered]@{}; Add-DevHosts $hostsWanted $dbUrl
    $changed = @()
    foreach ($k in $fill.Keys) {
        if (-not $current.Contains($k) -or $current[$k] -match $Placeholder) {
            Set-EnvLine $lines $k $fill[$k]; $changed += $k
        }
    }
    if ($hostsWanted.Contains('DEV_DATABASE_HOSTS')) {
        $have = $(if ($current.Contains('DEV_DATABASE_HOSTS')) { $current['DEV_DATABASE_HOSTS'] } else { '' })
        if ($have -notmatch [regex]::Escape($ep)) { Set-EnvLine $lines 'DEV_DATABASE_HOSTS' $hostsWanted['DEV_DATABASE_HOSTS']; $changed += 'DEV_DATABASE_HOSTS' }
    }
    if ($changed.Count -gt 0) {
        $backup = "$beEnv.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item $beEnv $backup
        [System.IO.File]::WriteAllLines($beEnv, $lines, $Utf8NoBom)
        Good "Đã điền vào BE\.env: $($changed -join ', ') (sao lưu: $(Split-Path -Leaf $backup))"
    } else { Good 'BE\.env đã đủ, không có ô trống để điền' }
} else {
    Good 'BE\.env đã có: KHÔNG sửa. (Muốn điền các ô còn trống từ secrets\: chạy lại với -FillMissing.)'
}

# ---------------------------------------------------------------- 5. FE\.env
Step 'FE\.env'
$feEnv = Join-Path $FeDir '.env'
if (-not (Test-Path $feEnv)) {
    $lines = New-Object 'System.Collections.Generic.List[string]'
    foreach ($l in [System.IO.File]::ReadAllLines((Join-Path $FeDir '.env.example'))) { $lines.Add($l) }
    Set-EnvLine $lines 'VITE_API_BASE_URL' 'http://127.0.0.1:8001/api/v1'
    [System.IO.File]::WriteAllLines($feEnv, $lines, $Utf8NoBom)
    Good 'Đã tạo FE\.env (VITE_API_BASE_URL=http://127.0.0.1:8001/api/v1)'
} else { Good 'FE\.env đã có: KHÔNG sửa' }

# ---------------------------------------------------------------- 6. kiểm tra
Step 'Kiểm tra cấu hình (BE\scripts\check_env.py, chỉ đọc)'
if (-not (Test-Path $venvPy)) { Fail 'Chưa có BE\.venv: chạy lại không dùng -SkipInstall.' }
$checkArgs = @('scripts\check_env.py')
if ($SkipDb) { $checkArgs += '--skip-db' }
if ($SkipSmtp) { $checkArgs += '--skip-smtp' }
Push-Location $BeDir
try { & $venvPy @checkArgs; $code = $LASTEXITCODE } finally { Pop-Location }

Write-Host ''
if ($code -eq 0) {
    Write-Host 'XONG. Chạy ứng dụng: powershell -ExecutionPolicy Bypass -File scripts\run_all.ps1' -ForegroundColor Green
    Write-Host '      (hoặc run_be.ps1 và run_fe.ps1 trong hai cửa sổ). Mở http://localhost:5173' -ForegroundColor Green
} elseif ($code -eq 2) {
    Write-Host 'DỪNG: DATABASE_URL trỏ production. Sửa BE\.env trước khi chạy BE.' -ForegroundColor Red
} else {
    Write-Host 'Còn mục cần sửa (xem [LỖI] ở trên). Sửa xong chạy lại script này.' -ForegroundColor Yellow
}
exit $code
