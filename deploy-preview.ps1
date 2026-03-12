# ============================================================
# Matra - Deploy Preview Build to Connected Android Device
# Usage:
#   .\deploy-preview.ps1              -> Build + install on connected device
#   .\deploy-preview.ps1 -SkipBuild   -> Skip EAS build, just install last APK
#   .\deploy-preview.ps1 -SkipBuild -ApkPath "C:\path\to\file.apk"
# ============================================================
param(
    [switch]$SkipBuild,
    [string]$ApkPath
)

$ErrorActionPreference = "Stop"
$MOBILE   = "$PSScriptRoot\mobile"
$ADB      = "C:\Users\papia\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$DEVICE   = "R5CN20F740X"
$PACKAGE  = "com.matra.app"
$DOWNLOAD = "$env:USERPROFILE\Downloads"

# -- 1. Check device is connected --------------------------------
Write-Host "`n[1] Checking ADB device..." -ForegroundColor Cyan
$devices = (& $ADB devices 2>&1) -join "`n"
if ($devices -notmatch $DEVICE) {
    Write-Host "ERROR: Device $DEVICE not found. Connect via USB and enable USB debugging." -ForegroundColor Red
    exit 1
}
Write-Host "  OK: Device $DEVICE connected" -ForegroundColor Green

# -- 2. Build on EAS ---------------------------------------------
if (-not $SkipBuild -and -not $ApkPath) {
    Write-Host "`n[2] Building preview APK on EAS (this takes ~10-15 min)..." -ForegroundColor Cyan
    Push-Location $MOBILE
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $buildLog = eas build --profile preview --platform android --non-interactive 2>&1
    $ErrorActionPreference = $prevPref
    $buildLog | Write-Host
    Pop-Location

    $urlLine = $buildLog | Where-Object { $_ -match "https://.*\.apk" } | Select-Object -First 1
    if ($urlLine -match "(https://\S+\.apk)") {
        $apkUrl = $Matches[1]
        Write-Host "  Downloading APK..." -ForegroundColor Cyan
        $ApkPath = "$DOWNLOAD\matra-preview.apk"
        Invoke-WebRequest -Uri $apkUrl -OutFile $ApkPath
        Write-Host "  OK: Downloaded to $ApkPath" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  Could not auto-detect APK URL." -ForegroundColor Yellow
        Write-Host "  1. Open https://expo.dev/accounts/charlesbueso/projects/matra/builds" -ForegroundColor White
        Write-Host "  2. Download the .apk file to your Downloads folder" -ForegroundColor White
        Write-Host "  3. Rerun: .\deploy-preview.ps1 -SkipBuild" -ForegroundColor White
        exit 0
    }
} elseif (-not $ApkPath) {
    $found = Get-ChildItem "$DOWNLOAD\*.apk" -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -match "matra|application" } |
             Sort-Object LastWriteTime -Descending |
             Select-Object -First 1
    if (-not $found) {
        Write-Host "ERROR: No APK found in $DOWNLOAD. Pass -ApkPath explicitly." -ForegroundColor Red
        exit 1
    }
    $ApkPath = $found.FullName
    Write-Host "  Using: $ApkPath" -ForegroundColor Green
}

# -- 3. Uninstall existing app -----------------------------------
Write-Host "`n[3] Uninstalling existing app..." -ForegroundColor Cyan
$uninstall = & $ADB -s $DEVICE uninstall $PACKAGE 2>&1
if ("$uninstall" -match "Success") {
    Write-Host "  OK: Uninstalled $PACKAGE" -ForegroundColor Green
} else {
    Write-Host "  Not installed or already removed - continuing" -ForegroundColor Yellow
}

# -- 4. Install new APK ------------------------------------------
Write-Host "`n[4] Installing $ApkPath..." -ForegroundColor Cyan
$install = & $ADB -s $DEVICE install $ApkPath 2>&1
if ("$install" -match "Success") {
    Write-Host "  OK: Installed successfully!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Install failed:" -ForegroundColor Red
    Write-Host $install
    exit 1
}

# -- 5. Launch app -----------------------------------------------
Write-Host "`n[5] Launching Matra..." -ForegroundColor Cyan
& $ADB -s $DEVICE shell am start -n "$PACKAGE/$PACKAGE.MainActivity" | Out-Null
Write-Host "  OK: App launched on device" -ForegroundColor Green

Write-Host "`nDone! Matra preview is running on your device.`n" -ForegroundColor Green
