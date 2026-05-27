const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..', '..')
const distSource = path.join(__dirname, '..', 'dist', 'win-unpacked')
const distDest = path.join(rootDir, '.riescade')
const rootExe = path.join(rootDir, 'RIESCADE.exe')
const targetExe = path.join(distDest, 'RIESCADE.exe')
const iconIcoSource = path.join(__dirname, '..', 'src', 'main', 'resources', 'riescade.ico')
const iconIco = path.join(distDest, 'resources', 'riescade.ico')

// Source resource directories
const logosSrc = path.join(__dirname, '..', 'src', 'main', 'resources', 'logos')
const artsSrc = path.join(__dirname, '..', 'src', 'main', 'resources', 'arts')
const fontsSrc = path.join(__dirname, '..', 'src', 'main', 'resources', 'fonts')
const overlaySrc = path.join(__dirname, '..', 'src', 'main', 'resources', 'overlay')

// Destination resource directories
const logosDest = path.join(distDest, 'resources', 'logos')
const artsDest = path.join(distDest, 'resources', 'arts')
const fontsDest = path.join(distDest, 'resources', 'fonts')
const overlayDest = path.join(distDest, 'resources', 'overlay')

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src)
  const stats = exists && fs.statSync(src)
  const isDirectory = exists && stats.isDirectory()
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName))
    })
  } else {
    const copyWithRetry = (from, to) => {
      const maxRetries = 8
      const delayMs = 150

      const destDir = path.dirname(to)
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          fs.copyFileSync(from, to)
          return
        } catch (e) {
          const code = e?.code
          if (code !== 'EBUSY' && code !== 'EPERM') throw e
          if (attempt === maxRetries) {
            throw new Error(
              `File is locked: ${from}\nClose RIESCADE and retry deploy. Original: ${e.message || e}`
            )
          }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)
        }
      }
    }

    copyWithRetry(src, dest)
  }
}

console.log('🚀 Starting deployment...')

// 1. Copy unpacked build to .riescade root
if (fs.existsSync(distSource)) {
  console.log(`📦 Copying build from ${distSource} to ${distDest}...`)
  copyRecursiveSync(distSource, distDest)
  
  // 1.2 Copy descompacted resources (logos, arts, fonts, overlay)
  console.log('📦 Copying system assets (logos, arts, fonts, overlay) to resources...')
  if (fs.existsSync(logosSrc)) copyRecursiveSync(logosSrc, logosDest)
  if (fs.existsSync(artsSrc)) copyRecursiveSync(artsSrc, artsDest)
  if (fs.existsSync(fontsSrc)) copyRecursiveSync(fontsSrc, fontsDest)
  if (fs.existsSync(overlaySrc)) copyRecursiveSync(overlaySrc, overlayDest)
} else {
  console.log('⚠️ Build source not found. Make sure you ran "npm run build" first.')
  process.exit(1)
}

// 2. Create C# compiled wrapper RIESCADE.exe in root
console.log(`🔗 Creating shortcut/launcher at ${rootExe}...`)
try {
  if (fs.existsSync(rootExe)) fs.unlinkSync(rootExe)
} catch {}

const escapePs = (s) => String(s).replace(/`/g, '``').replace(/"/g, '`"')

try {
  const ps = `
$ErrorActionPreference = 'Stop'
$outExe = "${escapePs(rootExe)}"
$targetExe = "${escapePs(targetExe)}"
$workDir = "${escapePs(distDest)}"
$iconPath = "${escapePs(iconIcoSource)}"

if (Test-Path $outExe) { Remove-Item -Force $outExe }

$rt = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$csc = Join-Path $rt "csc.exe"
if (!(Test-Path $csc)) { throw "csc.exe not found at: $csc" }

$src = Join-Path $env:TEMP "riescade_launcher.cs"

$code = @"
using System;
using System.Diagnostics;
using System.IO;

public static class RiescadeLauncher
{
  public static int Main(string[] args)
  {
    try
    {
      string targetExe = @"${escapePs(targetExe)}";
      string workDir = @"${escapePs(distDest)}";

      if (!File.Exists(targetExe))
      {
        Console.Error.WriteLine("Missing target exe: " + targetExe);
        return 2;
      }

      var psi = new ProcessStartInfo
      {
        FileName = targetExe,
        WorkingDirectory = workDir,
        UseShellExecute = false,
      };

      Process.Start(psi);
      return 0;
    }
    catch (Exception ex)
    {
      Console.Error.WriteLine(ex.ToString());
      return 1;
    }
  }
}
"@

Set-Content -Path $src -Value $code -Encoding UTF8

$args = @(
  "/nologo",
  "/target:winexe",
  "/optimize+",
  "/win32icon:$iconPath",
  "/out:$outExe",
  $src
)

& $csc @args | Out-Null
`

  const encoded = Buffer.from(ps, 'utf16le').toString('base64')
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, { stdio: 'inherit' })
  console.log('✅ Launcher created successfully!')
} catch (e) {
  console.log('⚠️ Failed to compile launcher exe. Creating .cmd fallback...')
  const cmdPath = path.join(rootDir, 'RIESCADE.cmd')
  const cmd = `@echo off\r\npushd "${distDest}"\r\nstart "" "${targetExe}"\r\npopd\r\n`
  fs.writeFileSync(cmdPath, cmd, 'utf8')
  console.log(`✅ Fallback launcher created: ${cmdPath}`)
}

console.log('🎉 Deployment complete!')
