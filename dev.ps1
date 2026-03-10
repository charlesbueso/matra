# ============================================================
# Matra — One-Command Dev Environment Startup
# Usage:
#   .\dev.ps1              → Android Emulator (default)
#   .\dev.ps1 -Target expo → Expo Go on physical device (LAN)
# ============================================================
param(
    [ValidateSet("emulator", "expo")]
    [string]$Target = "emulator"
)

$ErrorActionPreference = "Continue"
$ROOT = $PSScriptRoot
$BACKEND = "$ROOT\backend"
$MOBILE = "$ROOT\mobile"
$ANDROID_HOME = "C:\Users\papia\AppData\Local\Android\Sdk"
$SUPABASE = "C:\tools\supabase\supabase.exe"
$DOCKER = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$EMULATOR = "$ANDROID_HOME\emulator\emulator.exe"
$ADB = "$ANDROID_HOME\platform-tools\adb.exe"
$AVD = "Pixel_8"

# ── 1. Start Docker Desktop if not running ──
$docker = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Host "[1/5] Starting Docker Desktop..." -ForegroundColor Cyan
    Start-Process $DOCKER
    Write-Host "       Waiting for Docker to be ready..."
    do {
        Start-Sleep -Seconds 3
        $ready = & "C:\Program Files\Docker\Docker\resources\bin\docker.exe" info 2>&1 | Select-String "Server Version"
    } while (-not $ready)
    Write-Host "       Docker is ready." -ForegroundColor Green
} else {
    Write-Host "[1/5] Docker Desktop already running." -ForegroundColor Green
}

# ── 2. Start Supabase ──
Write-Host "[2/5] Starting Supabase..." -ForegroundColor Cyan
Push-Location $BACKEND
$status = & $SUPABASE status 2>&1 | Select-String "is running"
if ($status) {
    Write-Host "       Supabase already running." -ForegroundColor Green
} else {
    & $SUPABASE start
}
Pop-Location

# ── 3. Serve Edge Functions (background) ──
Write-Host "[3/5] Starting Edge Functions..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$BACKEND'; & '$SUPABASE' functions serve --env-file .env.local --no-verify-jwt" -WindowStyle Minimized

if ($Target -eq "emulator") {
    # ── 4. Start Android Emulator (background) ──
    # Kill ALL emulator processes at the OS level to clear stale entries
    $emuProcs = Get-Process "qemu-system*" -ErrorAction SilentlyContinue
    if ($emuProcs) {
        Write-Host "       Killing existing emulator processes..." -ForegroundColor Yellow
        $emuProcs | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
    # Restart ADB server to purge stale device entries
    & $ADB kill-server 2>$null
    Start-Sleep -Seconds 1
    & $ADB start-server 2>$null
    Start-Sleep -Seconds 1

    Write-Host "[4/5] Starting Android emulator ($AVD)..." -ForegroundColor Cyan
    Start-Process $EMULATOR -ArgumentList "-avd", $AVD -WindowStyle Minimized
    Write-Host "       Waiting for emulator to boot..."

    # Wait for the emulator to appear in adb devices with "device" state
    $EMULATOR_SERIAL = $null
    $retries = 0
    do {
        Start-Sleep -Seconds 2
        $retries++
        $emulatorLine = & $ADB devices 2>&1 | Select-String "emulator-\d+\s+device"
        if ($emulatorLine) {
            $EMULATOR_SERIAL = ("$emulatorLine" -split "\s+")[0]
        }
    } while (-not $EMULATOR_SERIAL -and $retries -lt 30)

    if (-not $EMULATOR_SERIAL) {
        Write-Host "       ERROR: Emulator did not connect within 60 seconds." -ForegroundColor Red
        exit 1
    }

    # Wait for boot to complete
    do {
        Start-Sleep -Seconds 2
        $booted = & $ADB -s $EMULATOR_SERIAL shell getprop sys.boot_completed 2>&1
    } while ("$booted".Trim() -ne "1")
    Write-Host "       Emulator ready ($EMULATOR_SERIAL)." -ForegroundColor Green

    # ── 5. Start Expo (emulator) ──
    Write-Host "[5/5] Starting Expo (emulator mode)..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  All services running! Target: EMULATOR" -ForegroundColor Green
    Write-Host "  Press Ctrl+C in this window to stop Expo." -ForegroundColor Yellow
    Write-Host ""
    Set-Location $MOBILE

    # Set up adb reverse so the emulator can reach Metro and Supabase on localhost
    & $ADB -s $EMULATOR_SERIAL reverse tcp:8081 tcp:8081 2>$null
    & $ADB -s $EMULATOR_SERIAL reverse tcp:54321 tcp:54321 2>$null

    # Start Metro — auto-open on the emulator via a scheduled intent
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Start-Sleep 12; & '$ADB' -s $EMULATOR_SERIAL shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'" -WindowStyle Hidden
    npx expo start --localhost

} else {
    # ── 4. Forward Supabase port to LAN so the phone can reach it ──
    # Docker binds Supabase to 127.0.0.1:54321 — unreachable from physical
    # devices on WiFi. A lightweight Node TCP proxy bridges LAN_IP:54321
    # to 127.0.0.1:54321 without requiring admin privileges.

    $lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
              Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and
                             $_.PrefixOrigin -in @("Dhcp","Manual") -and
                             $_.IPAddress -notlike "169.254.*" } |
              Select-Object -First 1).IPAddress

    if (-not $lanIp) {
        Write-Host "[4/5] WARNING: Could not detect LAN IP. Physical device may not reach Supabase." -ForegroundColor Red
    } else {
        Write-Host "[4/5] Starting Supabase LAN proxy ($lanIp`:54321 -> 127.0.0.1:54321)..." -ForegroundColor Cyan
        $proxyJs = @"
const net = require('net');
const s = net.createServer(c => {
  const t = net.connect(54321, '127.0.0.1');
  c.pipe(t).pipe(c);
  c.on('error', () => t.destroy());
  t.on('error', () => c.destroy());
});
s.listen(54321, '$lanIp', () =>
  console.log('Supabase LAN proxy ready: $lanIp`:54321 -> 127.0.0.1:54321'));
s.on('error', e => {
  console.error('Proxy failed:', e.message);
  process.exit(1);
});
"@
        Start-Process node -ArgumentList "-e", $proxyJs -WindowStyle Minimized
        Write-Host "       LAN proxy running." -ForegroundColor Green
    }

    # ── 5. Start Expo (LAN mode for Expo Go) ──
    Write-Host "[5/5] Starting Expo (Expo Go / LAN mode)..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  All services running! Target: EXPO GO" -ForegroundColor Green
    if ($lanIp) {
        Write-Host "  Supabase available at: http://$lanIp`:54321" -ForegroundColor Green
    }
    Write-Host "  Scan the QR code with Expo Go on your phone." -ForegroundColor Yellow
    Write-Host "  Press Ctrl+C in this window to stop Expo." -ForegroundColor Yellow
    Write-Host ""
    Set-Location $MOBILE
    npx expo start --lan
}
