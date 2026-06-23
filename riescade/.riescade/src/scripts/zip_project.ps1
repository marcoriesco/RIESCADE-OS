# Packaging script for RIESCADE OS - PORTABLE PROJECT PACKAGER
$ErrorActionPreference = 'Stop'

# Resolve paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($scriptDir)) {
    $scriptDir = (Get-Item .).FullName
}
Set-Location $scriptDir

# Project root is 4 directories up relative to the scripts folder
$projectRoot = (Get-Item (Join-Path $scriptDir '..\..\..\..')).FullName

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "RIESCADE OS - PORTABLE PROJECT PACKAGER" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Packaging project into RIESCADE_OS.7z..."
Write-Host "Project Root: $projectRoot"

$temp = Join-Path $env:TEMP 'riescade_zip_temp'
$zipPath = Join-Path $projectRoot 'RIESCADE_OS.7z'

# Clean previous temp and zip
if (Test-Path $temp) {
    Remove-Item -Path $temp -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}
New-Item -ItemType Directory -Path $temp | Out-Null

# --- ROOT FILES: only RIESCADE.exe and README.md ---
$rootFiles = @('RIESCADE.exe', 'README.md')
foreach ($file in $rootFiles) {
    $src = Join-Path $projectRoot $file
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $temp $file) -Force
        Write-Host "   [OK] $file"
    } else {
        Write-Host "   [WARN] $file not found, skipping." -ForegroundColor Yellow
    }
}

# --- RIESCADE folder (complete .riescade minus src/) ---
$esSource = Join-Path $projectRoot 'riescade'
$esDest = Join-Path $temp 'riescade'
if (Test-Path $esSource) {
    Copy-Item -Path $esSource -Destination $esDest -Recurse -Force
    # Remove the development source code folder
    $srcDir = Join-Path (Join-Path $esDest '.riescade') 'src'
    if (Test-Path $srcDir) {
        Remove-Item -Path $srcDir -Recurse -Force
        Write-Host "   [OK] riescade/.riescade/ (src/ excluded)"
    } else {
        Write-Host "   [OK] riescade/"
    }
    # Remove the database file (each user generates their own)
    $dbFile = Join-Path (Join-Path $esDest '.riescade') 'riescade.db'
    if (Test-Path $dbFile) {
        Remove-Item -Path $dbFile -Force
        Write-Host "   [OK] riescade.db excluded"
    }

    # Empty the logs folder in the temp release directory
    $logsDir = Join-Path (Join-Path $esDest '.riescade') 'logs'
    if (Test-Path $logsDir) {
        Remove-Item -Path $logsDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    Write-Host "   [OK] riescade/.riescade/logs/ (emptied)"

    # Remove emulatorLauncher logs from temp release directory
    if (Test-Path $esDest) {
        Get-ChildItem -Path $esDest -Filter "*.log" -ErrorAction SilentlyContinue | Remove-Item -Force
        Get-ChildItem -Path $esDest -Filter "*.log.old" -ErrorAction SilentlyContinue | Remove-Item -Force
        Write-Host "   [OK] emulatorLauncher logs excluded"
    }
}

# --- EMPTY PLACEHOLDER FOLDERS ---
$emptyFolders = @('bios', 'roms', 'saves', 'screenshots')
foreach ($folder in $emptyFolders) {
    $folderPath = Join-Path $temp $folder
    New-Item -ItemType Directory -Path $folderPath -Force | Out-Null
    # Create an empty .keep file to ensure all zip tools/git preserve it
    New-Item -ItemType File -Path (Join-Path $folderPath '.keep') -Force | Out-Null
    Write-Host "   [OK] $folder/ (.keep)"
}

# --- ADDITIONAL ROOT FOLDERS (sounds, decorations, cheats, system, user, emulators) ---
$extraFolders = @('sounds', 'decorations', 'cheats', 'system', 'user', 'emulators')
foreach ($folder in $extraFolders) {
    $src = if ($folder -eq 'emulators') { Join-Path $projectRoot 'emulators_release' } else { Join-Path $projectRoot $folder }
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $temp $folder) -Recurse -Force
        Write-Host "   [OK] $folder/"
    }
}

# --- Compress using 7z.exe (prioritizing system installation for up-to-date version) ---
Write-Host "Creating 7z archive..." -ForegroundColor Cyan
$7zExe = "C:\Program Files\7-Zip\7z.exe"
if (!(Test-Path $7zExe)) {
    $7zExe = Join-Path $projectRoot "riescade\7z.exe"
}
if (!(Test-Path $7zExe)) {
    $7zExe = "7z" # Fallback to PATH
}
& $7zExe a -t7z -mx=5 -ms=on $zipPath (Join-Path $temp "*")

# Cleanup
if (Test-Path $temp) {
    Remove-Item -Path $temp -Recurse -Force
}

$zipSizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "Success! Created RIESCADE_OS.7z ($zipSizeMB MB)" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
