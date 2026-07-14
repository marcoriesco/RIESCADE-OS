const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..', '..', '..', '..') // Go up to RIESCADE OS root: src/scripts -> src -> .riescade -> riescade -> RIESCADE OS root
const distSource = path.join(__dirname, '..', 'dist', 'win-unpacked')
const distDest = path.join(rootDir, 'riescade', '.riescade')
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

// 1. Copy unpacked build to riescade/.riescade root
if (fs.existsSync(distSource)) {
  console.log(`📦 Copying build from ${distSource} to ${distDest}...`)
  copyRecursiveSync(distSource, distDest)
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
      string baseDir = AppDomain.CurrentDomain.BaseDirectory;
      string targetExe = Path.Combine(baseDir, @"riescade\\.riescade\\RIESCADE.exe");
      string workDir = Path.Combine(baseDir, @"riescade\\.riescade");

      if (!File.Exists(targetExe))
      {
        System.Windows.Forms.MessageBox.Show(
          "RIESCADE.exe not found at:\\n" + targetExe + "\\n\\nMake sure the folder structure is intact.",
          "RIESCADE - Error",
          System.Windows.Forms.MessageBoxButtons.OK,
          System.Windows.Forms.MessageBoxIcon.Error);
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
      System.Windows.Forms.MessageBox.Show(
        "Failed to start RIESCADE:\\n" + ex.Message,
        "RIESCADE - Error",
        System.Windows.Forms.MessageBoxButtons.OK,
        System.Windows.Forms.MessageBoxIcon.Error);
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
  "/reference:System.Windows.Forms.dll",
  "/out:$outExe",
  $src
)

if (Test-Path $iconPath) {
  $args = @("/win32icon:$iconPath") + $args
}

& $csc @args | Out-Null
`

  const encoded = Buffer.from(ps, 'utf16le').toString('base64')
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, { stdio: 'inherit' })
  console.log('✅ Launcher created successfully!')
} catch (e) {
  console.log('⚠️ Failed to compile launcher exe. Creating .cmd fallback...')
  const cmdPath = path.join(rootDir, 'RIESCADE.cmd')
  const cmd = `@echo off\r\npushd "%~dp0riescade\\.riescade"\r\nstart "" "RIESCADE.exe"\r\npopd\r\n`
  fs.writeFileSync(cmdPath, cmd, 'utf8')
  console.log(`✅ Fallback launcher created: ${cmdPath}`)
}

// 3. Create RIESCADEUpdater.exe inside riescade/updater/ folder
const updaterExe = path.join(rootDir, 'riescade', 'updater', 'RIESCADEUpdater.exe')
console.log(`🔗 Creating updater at ${updaterExe}...`)
try {
  if (fs.existsSync(updaterExe)) fs.unlinkSync(updaterExe)
} catch {}

try {
  const tempDir = process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp'
  const updaterCsPath = path.join(tempDir, 'riescade_updater.cs')
  
  const updaterCode = `using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

public class ProgressForm : Form
{
    private System.Windows.Forms.Timer animationTimer;
    private float spinAngle = 0;
    private string statusText = "Inicializando...";

    public ProgressForm()
    {
        this.Text = "RIESCADE Updater";
        this.FormBorderStyle = FormBorderStyle.None;
        this.StartPosition = FormStartPosition.CenterScreen;
        this.Size = new Size(380, 120);
        this.BackColor = Color.FromArgb(24, 24, 27); // Modern dark color (zinc-900)
        this.DoubleBuffered = true;

        this.animationTimer = new System.Windows.Forms.Timer();
        this.animationTimer.Interval = 30; // ~33 FPS
        this.animationTimer.Tick += (s, e) => {
            spinAngle = (spinAngle + 10) % 360;
            this.Invalidate();
        };
        this.animationTimer.Start();
    }

    public string StatusText
    {
        get { return statusText; }
        set {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(() => { StatusText = value; }));
            }
            else
            {
                statusText = value;
                this.Invalidate();
            }
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        // Draw border (using theme color #9f0043)
        using (Pen borderPen = new Pen(Color.FromArgb(159, 0, 67), 2))
        {
            g.DrawRectangle(borderPen, 1, 1, this.Width - 2, this.Height - 2);
        }

        // Draw animated spinner
        int spinnerSize = 36;
        int spinnerX = 30;
        int spinnerY = (this.Height - spinnerSize) / 2;

        // Draw background track of spinner (darker gray)
        using (Pen trackPen = new Pen(Color.FromArgb(39, 39, 42), 4))
        {
            g.DrawEllipse(trackPen, spinnerX, spinnerY, spinnerSize, spinnerSize);
        }

        // Draw animated arc of spinner (pink)
        using (Pen arcPen = new Pen(Color.FromArgb(159, 0, 67), 4))
        {
            g.DrawArc(arcPen, spinnerX, spinnerY, spinnerSize, spinnerSize, spinAngle, 100);
        }

        // Draw title
        using (Font titleFont = new Font("Segoe UI", 12, FontStyle.Bold))
        using (Brush titleBrush = new SolidBrush(Color.White))
        {
            g.DrawString("Atualizando RIESCADE...", titleFont, titleBrush, 85, 30);
        }

        // Draw status description
        using (Font descFont = new Font("Segoe UI", 9, FontStyle.Regular))
        using (Brush descBrush = new SolidBrush(Color.FromArgb(161, 161, 170))) // zinc-400
        {
            g.DrawString(statusText, descFont, descBrush, 85, 58);
        }

        // Draw footer "Aguarde..."
        using (Font footerFont = new Font("Segoe UI", 8, FontStyle.Italic))
        using (Brush footerBrush = new SolidBrush(Color.FromArgb(113, 113, 122))) // zinc-500
        {
            g.DrawString("Por favor, aguarde...", footerFont, footerBrush, 85, 78);
        }
    }
}

public static class RiescadeUpdater
{
    public static int Main(string[] args)
    {
        if (args.Length < 3)
        {
            MessageBox.Show(
                "Usage: RIESCADEUpdater.exe <zipPath> <currentAppDir> <execPath>",
                "RIESCADE Updater Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }

        string zipPath = args[0];
        string currentAppDir = args[1];
        string execPath = args[2];

        // Cleanup any .old files from previous runs
        try
        {
            string selfPath = Assembly.GetExecutingAssembly().Location;
            string oldSelf = selfPath + ".old";
            if (File.Exists(oldSelf))
            {
                File.Delete(oldSelf);
            }
        }
        catch {}

        ProgressForm form = new ProgressForm();

        Thread worker = new Thread(() => {
            try
            {
                // 1. Wait for RIESCADE processes to close
                form.StatusText = "Fechando RIESCADE...";
                Thread.Sleep(2000);
                var currentPid = Process.GetCurrentProcess().Id;
                foreach (var process in Process.GetProcessesByName("RIESCADE"))
                {
                    if (process.Id != currentPid)
                    {
                        try { if (!process.HasExited) process.WaitForExit(5000); } catch {}
                    }
                }
                foreach (var process in Process.GetProcessesByName("riescade"))
                {
                    if (process.Id != currentPid)
                    {
                        try { if (!process.HasExited) process.WaitForExit(5000); } catch {}
                    }
                }

                // 2. Prepare temp extraction directory
                form.StatusText = "Preparando diretório temporário...";
                string tempExtractDir = Path.Combine(Path.GetTempPath(), "rcupd");
                if (Directory.Exists(tempExtractDir))
                {
                    Directory.Delete(tempExtractDir, true);
                }
                Directory.CreateDirectory(tempExtractDir);

                // 3. Extract the ZIP / 7Z
                if (!File.Exists(zipPath))
                {
                    throw new FileNotFoundException("Arquivo de atualização não encontrado: " + zipPath);
                }

                form.StatusText = "Descompactando arquivos da atualização...";
                string extension = Path.GetExtension(zipPath).ToLower();
                if (extension == ".7z")
                {
                    string selfDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                    string sevenZipExe = Path.Combine(selfDir, "7z.exe");
                    if (!File.Exists(sevenZipExe))
                    {
                        sevenZipExe = "7z.exe";
                        if (!File.Exists(sevenZipExe) && File.Exists("C:\\\\Program Files\\\\7-Zip\\\\7z.exe"))
                        {
                            sevenZipExe = "C:\\\\Program Files\\\\7-Zip\\\\7z.exe";
                        }
                    }

                    var startInfo = new ProcessStartInfo
                    {
                        FileName = sevenZipExe,
                        Arguments = string.Format("x \\"{0}\\" -o\\"{1}\\" -y", zipPath, tempExtractDir),
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true
                    };

                    using (var process = Process.Start(startInfo))
                    {
                        process.WaitForExit();
                        if (process.ExitCode != 0)
                        {
                            string err = process.StandardError.ReadToEnd();
                            string opt = process.StandardOutput.ReadToEnd();
                            throw new Exception("Falha na extração com o 7-Zip: " + err);
                        }
                    }
                }
                else
                {
                    ZipFile.ExtractToDirectory(zipPath, tempExtractDir);
                }

                // 4. Find the source directory to copy from
                string srcDir = tempExtractDir;
                string[] foundExes = Directory.GetFiles(tempExtractDir, "RIESCADE.exe", SearchOption.AllDirectories);
                if (foundExes.Length > 0)
                {
                    Array.Sort(foundExes, (a, b) => a.Length.CompareTo(b.Length));
                    srcDir = Path.GetDirectoryName(foundExes[0]);
                }

                // 5. Recursively copy files to currentAppDir
                form.StatusText = "Copiando novos arquivos do sistema...";
                CopyDirectory(srcDir, currentAppDir);

                // 6. Clean up
                form.StatusText = "Limpando arquivos temporários...";
                try { Directory.Delete(tempExtractDir, true); } catch {}
                try { File.Delete(zipPath); } catch {}

                // 7. Re-launch RIESCADE.exe
                form.StatusText = "Reiniciando...";
                Thread.Sleep(1000);

                if (File.Exists(execPath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = execPath,
                        WorkingDirectory = Path.GetDirectoryName(execPath),
                        UseShellExecute = true
                    });
                }
                else
                {
                    MessageBox.Show(
                        "Atualização concluída, mas o executável do inicializador não foi encontrado:\\n" + execPath,
                        "RIESCADE Updater",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                }

                form.Invoke(new Action(() => form.Close()));
            }
            catch (Exception ex)
            {
                form.Invoke(new Action(() => {
                    form.Hide();
                    MessageBox.Show(
                        "Ocorreu um erro durante a instalação da atualização:\\n\\n" + ex.Message,
                        "Erro do Atualizador",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    form.Close();
                }));
            }
        });

        worker.Start();
        Application.Run(form);
        return 0;
    }

    private static void CopyDirectory(string sourceDir, string destDir)
    {
        if (!Directory.Exists(destDir))
        {
            Directory.CreateDirectory(destDir);
        }

        foreach (string file in Directory.GetFiles(sourceDir))
        {
            string destFile = Path.Combine(destDir, Path.GetFileName(file));
            
            if (string.Equals(Path.GetFileName(file), "RIESCADEUpdater.exe", StringComparison.OrdinalIgnoreCase))
            {
                if (File.Exists(destFile))
                {
                    try
                    {
                        string oldFile = destFile + ".old";
                        if (File.Exists(oldFile))
                        {
                            File.Delete(oldFile);
                        }
                        File.Move(destFile, oldFile);
                    }
                    catch
                    {
                        continue;
                    }
                }
            }

            int attempts = 0;
            while (true)
            {
                try
                {
                    File.Copy(file, destFile, true);
                    break;
                }
                catch (Exception)
                {
                    attempts++;
                    if (attempts >= 20)
                    {
                        throw;
                    }
                    Thread.Sleep(1000);
                }
            }
        }

        foreach (string subDir in Directory.GetDirectories(sourceDir))
        {
            string destSubDir = Path.Combine(destDir, Path.GetFileName(subDir));
            CopyDirectory(subDir, destSubDir);
        }
    }
}
`

  fs.writeFileSync(updaterCsPath, updaterCode, 'utf8')

  const psUpdater = `
$ErrorActionPreference = 'Stop'
$outExe = "${escapePs(updaterExe)}"

if (Test-Path $outExe) { Remove-Item -Force $outExe }

$rt = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$csc = Join-Path $rt "csc.exe"
if (!(Test-Path $csc)) { throw "csc.exe not found at: $csc" }

$args = @(
  "/nologo",
  "/target:winexe",
  "/optimize+",
  "/reference:System.Windows.Forms.dll",
  "/reference:System.Drawing.dll",
  "/reference:System.IO.Compression.dll",
  "/reference:System.IO.Compression.FileSystem.dll",
  "/out:$outExe",
  "${escapePs(updaterCsPath)}"
)

& $csc @args | Out-Null
`

  const encodedUpdater = Buffer.from(psUpdater, 'utf16le').toString('base64')
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedUpdater}`, { stdio: 'inherit' })
  console.log('✅ Updater compiled successfully!')

  try {
    fs.unlinkSync(updaterCsPath)
  } catch {}
} catch (e) {
  console.error('❌ Failed to compile RIESCADEUpdater.exe:', e.message || e)
}

console.log('🎉 Deployment complete!')
