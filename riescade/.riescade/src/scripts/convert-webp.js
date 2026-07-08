const fs = require('fs');
const path = require('path');

// Dynamically load sharp
let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.error('\x1b[31mError: "sharp" package is not installed. Please run "npm install" first.\x1b[0m');
  process.exit(1);
}

// Configs
const WEBP_QUALITY = 80;
const EXCLUDED_FOLDERS = ['video', 'manual'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff'];

// Resolve ROMs directory relative to this script
// Structure: <RetroBat>/riescade/.riescade/src/scripts/convert-webp.js -> <RetroBat>/roms
const romsPath = path.resolve(__dirname, '..', '..', '..', '..', 'roms');

async function getStats(file) {
  try {
    const stat = await fs.promises.stat(file);
    return stat.size;
  } catch {
    return 0;
  }
}

async function convertImage(srcPath, destPath) {
  const originalSize = await getStats(srcPath);
  
  const buffer = await fs.promises.readFile(srcPath);
  await sharp(buffer)
    .webp({ quality: WEBP_QUALITY })
    .toFile(destPath);
    
  const newSize = await getStats(destPath);
  return { originalSize, newSize };
}

async function run() {
  console.log('\n\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m   RIESCADE OS - WEBPIFYING SYSTEM MEDIA ASSETS   \x1b[0m');
  console.log('\x1b[36m==================================================\x1b[0m');
  console.log(`Target ROMs directory: ${romsPath}\n`);

  if (!fs.existsSync(romsPath)) {
    console.error(`\x1b[31mError: ROMs directory not found at ${romsPath}\x1b[0m`);
    return;
  }

  const systems = await fs.promises.readdir(romsPath);
  let totalConverted = 0;
  let totalSavedBytes = 0;
  let totalErrors = 0;

  for (const sys of systems) {
    const sysPath = path.join(romsPath, sys);
    const sysStat = await fs.promises.stat(sysPath);
    if (!sysStat.isDirectory()) continue;

    const mediaPath = path.join(sysPath, 'media');
    if (!fs.existsSync(mediaPath)) continue;

    const mediaFolders = await fs.promises.readdir(mediaPath);
    let systemFilesToConvert = [];

    // Scan for files to convert in this system
    for (const folder of mediaFolders) {
      if (EXCLUDED_FOLDERS.includes(folder.toLowerCase())) continue;

      const folderPath = path.join(mediaPath, folder);
      const folderStat = await fs.promises.stat(folderPath);
      if (!folderStat.isDirectory()) continue;

      const files = await fs.promises.readdir(folderPath);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(ext)) {
          systemFilesToConvert.push({
            src: path.join(folderPath, file),
            dest: path.join(folderPath, path.basename(file, ext) + '.webp'),
            folder,
            file
          });
        }
      }
    }

    if (systemFilesToConvert.length === 0) continue;

    console.log(`📁 System: \x1b[1m${sys.toUpperCase()}\x1b[0m - Found ${systemFilesToConvert.length} assets to convert...`);
    let sysConverted = 0;
    let sysSavedBytes = 0;
    let sysErrors = 0;

    for (const task of systemFilesToConvert) {
      try {
        // If webp already exists and has the same name, we overwrite it.
        const { originalSize, newSize } = await convertImage(task.src, task.dest);
        
        // Remove original file after successful conversion
        await fs.promises.unlink(task.src);

        sysConverted++;
        sysSavedBytes += Math.max(0, originalSize - newSize);
      } catch (err) {
        sysErrors++;
        totalErrors++;
      }
    }

    totalConverted += sysConverted;
    totalSavedBytes += sysSavedBytes;
    
    const savedMb = (sysSavedBytes / (1024 * 1024)).toFixed(2);
    console.log(`   └─ Converted: \x1b[32m${sysConverted}\x1b[0m | Failed: \x1b[31m${sysErrors}\x1b[0m | Space Saved: \x1b[36m${savedMb} MB\x1b[0m`);
  }

  console.log('\n\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m                CONVERSION SUMMARY                \x1b[0m');
  console.log('\x1b[36m==================================================\x1b[0m');
  console.log(`Total Assets Converted: \x1b[32m${totalConverted}\x1b[0m`);
  console.log(`Total Errors/Failures : \x1b[31m${totalErrors}\x1b[0m`);
  console.log(`Total Storage Saved   : \x1b[36m${(totalSavedBytes / (1024 * 1024)).toFixed(2)} MB\x1b[0m`);
  console.log('\x1b[36m==================================================\x1b[0m\n');
}

run();
