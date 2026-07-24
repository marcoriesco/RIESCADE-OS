const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const readline = require('readline');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

// Load env files (.env)
function loadEnv() {
  const possiblePaths = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '..', '..', '.env')
  ];
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const dotenvContent = fs.readFileSync(envPath, 'utf8');
      dotenvContent.split(/\r?\n/).forEach(line => {
        const trimLine = line.trim();
        if (trimLine && !trimLine.startsWith('#')) {
          const index = trimLine.indexOf('=');
          if (index !== -1) {
            const key = trimLine.substring(0, index).trim();
            let val = trimLine.substring(index + 1).trim();
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.substring(1, val.length - 1);
            } else if (val.startsWith("'") && val.endsWith("'")) {
              val = val.substring(1, val.length - 1);
            }
            process.env[key] = val;
          }
        }
      });
    }
  }
}

// Recursive copy helper
function copyRecursiveSync(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    }
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function run() {
  loadEnv();
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  
  if (!token) {
    console.error('\x1b[31mError: GITHUB_TOKEN or GH_TOKEN not found in environment or .env file!\x1b[0m');
    console.error('Please create a Personal Access Token (PAT) with "repo" scope on GitHub:');
    console.error('https://github.com/settings/tokens');
    console.error('Then add it to a .env file in the root or src folder as:');
    console.error('GITHUB_TOKEN=your_token_here\n');
    process.exit(1);
  }

  let version = process.argv[2];
  if (!version) {
    const defaultVersionInput = await askQuestion('Enter release version (e.g. 2.1.0): ');
    version = defaultVersionInput.trim();
  }

  version = version.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('\x1b[31mError: Version must match semver format (X.Y.Z)!\x1b[0m');
    process.exit(1);
  }

  console.log(`\n🚀 Starting RIESCADE OS release pipeline for version v${version}...`);

  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const packageJsonPath = path.join(__dirname, '..', 'package.json');

  const initialStatus = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf8' }).trim();
  if (initialStatus) {
    console.error('\x1b[31mError: the repository has uncommitted changes. Commit or stash them before creating a release.\x1b[0m');
    process.exit(1);
  }
  
  // 1. Update version in package.json
  console.log('📝 Updating version in package.json...');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`✅ package.json version bumped to ${version}`);

  // Update version in system/version.info
  const versionInfoPath = path.join(projectRoot, 'system', 'riescade.info');
  if (fs.existsSync(versionInfoPath)) {
    fs.writeFileSync(versionInfoPath, version + '\n', 'utf8');
    console.log(`✅ system/riescade.info updated to ${version}`);
  }

  // 2. Build & Deploy the project (compile + electron-builder + deploy binaries)
  console.log('🛠️ Building and deploying Electron project...');
  execSync('npm run deploy', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  console.log('✅ Electron app built and deployed successfully.');

  // 3. Build the 7z using Node.js for precise control
  console.log('📦 Packing project into RIESCADE_OS.7z...');
  const tempDir = path.join(require('os').tmpdir(), 'riescade_zip_temp');
  const zipPath = path.join(projectRoot, 'RIESCADE_OS.7z');

  // Clean previous temp and 7z
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  fs.mkdirSync(tempDir, { recursive: true });

  // --- ROOT FILES: only RIESCADE.exe and README.md ---
  const rootFiles = ['RIESCADE.exe', 'README.md'];
  for (const file of rootFiles) {
    const src = path.join(projectRoot, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(tempDir, file));
      console.log(`   ✓ ${file}`);
    } else {
      console.log(`   ⚠ ${file} not found, skipping.`);
    }
  }

  // --- EMULATIONSTATION folder (complete .riescade minus src/) ---
  const esSource = path.join(projectRoot, 'riescade');
  const esDest = path.join(tempDir, 'riescade');
  if (fs.existsSync(esSource)) {
    copyRecursiveSync(esSource, esDest);
    // Remove the development source code folder
    const srcDir = path.join(esDest, '.riescade', 'src');
    if (fs.existsSync(srcDir)) {
      fs.rmSync(srcDir, { recursive: true, force: true });
      console.log('   ✓ riescade/.riescade/ (src/ excluded)');
    } else {
      console.log('   ✓ riescade/');
    }
    // Remove the database file (each user generates their own)
    for (const dbName of ['riescade.db', 'riescade.db-wal', 'riescade.db-shm']) {
      const dbFile = path.join(esDest, '.riescade', dbName);
      if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    }
    console.log('   ✓ runtime database files excluded');

    for (const runtimeFile of [
      path.join(esDest, '.riescade', 'configs', 'input-devices.json'),
      path.join(esDest, '.riescade', 'launcher', 'configs', 'teknoparrot-generated-hash.json')
    ]) {
      if (fs.existsSync(runtimeFile)) fs.unlinkSync(runtimeFile);
    }

    const stateDir = path.join(esDest, '.riescade', 'state');
    if (fs.existsSync(stateDir)) fs.rmSync(stateDir, { recursive: true, force: true });
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, '.keep'), '', 'utf8');
    console.log('   ✓ runtime state emptied (.keep added)');

    // Keep all distributed defaults, but never publish the current user's ScreenScraper login.
    const releaseSettingsPath = path.join(esDest, '.riescade', 'configs', 'settings.json');
    if (fs.existsSync(releaseSettingsPath)) {
      const releaseSettings = JSON.parse(fs.readFileSync(releaseSettingsPath, 'utf8'));
      for (const credentialName of ['ScreenScraperUser', 'ScreenScraperPass']) {
        const current = releaseSettings[credentialName];
        releaseSettings[credentialName] = {
          value: '',
          type: current && typeof current.type === 'string' ? current.type : 'string'
        };
      }
      fs.writeFileSync(releaseSettingsPath, JSON.stringify(releaseSettings, null, 2) + '\n', 'utf8');
      console.log('   ✓ ScreenScraper user credentials cleared from release copy');
    }

    // Clean up local user save files, screenshots, and videos from the release package
    const foldersToEmpty = ['saves', 'screenshots', 'videos'];
    for (const folderName of foldersToEmpty) {
      const folderPath = path.join(esDest, folderName);
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }
      fs.mkdirSync(folderPath, { recursive: true });
      fs.writeFileSync(path.join(folderPath, '.keep'), '', 'utf8');
      console.log(`   ✓ riescade/${folderName}/ emptied (.keep added)`);
    }

    // Empty the logs folder in the temp release directory
    const logsDir = path.join(esDest, '.riescade', 'logs');
    if (fs.existsSync(logsDir)) {
      fs.rmSync(logsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('   ✓ riescade/.riescade/logs/ emptied');

    // Remove any log files from the temp release directory
    for (const child of fs.readdirSync(esDest)) {
      if (child.endsWith('.log') || child.endsWith('.log.old')) {
        const logPath = path.join(esDest, child);
        fs.unlinkSync(logPath);
        console.log(`   ✓ ${child} excluded`);
      }
    }
  }

  // --- EMPTY PLACEHOLDER FOLDERS with .keep ---
  const emptyFolders = ['bios', 'roms', 'saves', 'screenshots'];
  for (const folder of emptyFolders) {
    const folderPath = path.join(tempDir, folder);
    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, '.keep'), '', 'utf8');
    console.log(`   ✓ ${folder}/ (.keep)`);
  }

  // --- ADDITIONAL ROOT FOLDERS (sounds, decorations, cheats, system, user, emulators) ---
  const extraFolders = ['sounds', 'decorations', 'cheats', 'system', 'user', 'emulators'];

  // Subfolders to exclude from release (used by external tools, not needed in production)
  const releaseExclusions = [
    'system/configgen',
    'system/download',
    'system/modules',
    'system/scripts',
    'system/templates'
  ];

  for (const folder of extraFolders) {
    const src = folder === 'emulators'
      ? path.join(projectRoot, 'emulators_release')
      : path.join(projectRoot, folder);
    if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
      copyRecursiveSync(src, path.join(tempDir, folder));
      console.log(`   ✓ ${folder}/`);
    }
  }

  // Remove excluded subfolders from temp release directory
  for (const exclusion of releaseExclusions) {
    const exclusionPath = path.join(tempDir, exclusion);
    if (fs.existsSync(exclusionPath)) {
      fs.rmSync(exclusionPath, { recursive: true, force: true });
      console.log(`   ✗ ${exclusion}/ excluded`);
    }
  }

  // --- Compress using 7-Zip ---
  let sevenZipPath = 'C:\\Program Files\\7-Zip\\7z.exe';
  if (!fs.existsSync(sevenZipPath)) {
    sevenZipPath = 'C:\\Program Files (x86)\\7-Zip\\7z.exe';
  }
  if (!fs.existsSync(sevenZipPath)) {
    sevenZipPath = path.join(projectRoot, 'riescade', '7z.exe');
  }
  if (!fs.existsSync(sevenZipPath)) {
    sevenZipPath = '7z'; // Fallback to PATH
  }
  
  console.log(`🤐 Compressing with 7-Zip from: ${sevenZipPath}`);
  execSync(`"${sevenZipPath}" a -t7z -mx=9 -ms=on "${zipPath}" "${tempDir}\\*"`, { stdio: 'inherit' });

  // Cleanup temp
  fs.rmSync(tempDir, { recursive: true, force: true });

  const sevenZipSizeMB = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  const sevenZipSize = fs.statSync(zipPath).size;
  const sevenZipSha256 = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
  console.log(`✅ 7z package created (${sevenZipSizeMB} MB)`);

  // Create updater.json file for the update checker to query
  console.log('📝 Creating updater.json file...');
  const updaterJsonPath = path.join(projectRoot, 'updater.json');
  const updaterContent = {
    version: version,
    releaseNotes: `Automated release for RIESCADE OS v${version}`,
    zipUrl: `https://github.com/marcoriesco/RIESCADE-OS/releases/download/v${version}/RIESCADE_OS.7z`,
    sha256: sevenZipSha256,
    size: sevenZipSize
  };
  fs.writeFileSync(updaterJsonPath, JSON.stringify(updaterContent, null, 2) + '\n', 'utf8');
  console.log('✅ updater.json created/updated.');

  // 4. Git Commit, Tag & Push
  console.log('🐙 Staging and committing version changes...');
  const releaseFiles = [
    path.relative(projectRoot, packageJsonPath),
    path.relative(projectRoot, updaterJsonPath)
  ];
  if (fs.existsSync(versionInfoPath)) releaseFiles.push(path.relative(projectRoot, versionInfoPath));
  execSync(`git add -- ${releaseFiles.map(file => `"${file}"`).join(' ')}`, { stdio: 'inherit', cwd: projectRoot });
  try {
    execSync(`git commit -m "chore(release): v${version}"`, { stdio: 'inherit', cwd: projectRoot });
  } catch (e) {
    console.log('⚠️ No changes to commit (version may already be up to date).');
  }
  
  console.log(`🏷️ Tagging Git commit with v${version}...`);
  try {
    execSync(`git rev-parse -q --verify "refs/tags/v${version}"`, { stdio: 'ignore', cwd: projectRoot });
    throw new Error(`Tag v${version} already exists. Release tags are immutable.`);
  } catch (e) {
    if (String(e.message || e).includes('immutable')) throw e;
  }
  execSync(`git tag v${version}`, { stdio: 'inherit', cwd: projectRoot });

  console.log('📤 Pushing commits and tag to GitHub repository...');
  execSync('git push origin main', { stdio: 'inherit', cwd: projectRoot });
  execSync(`git push origin v${version}`, { stdio: 'inherit', cwd: projectRoot });
  console.log('✅ Git branch and tag pushed.');

  // 5. Create GitHub Release
  const repoOwner = 'marcoriesco';
  const repoName = 'RIESCADE-OS';
  const createReleaseUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases`;

  console.log(`🌐 Creating GitHub Release for v${version}...`);
  const releasePayload = {
    tag_name: `v${version}`,
    target_commitish: 'main',
    name: `RIESCADE OS v${version}`,
    body: `Automated release for RIESCADE OS v${version}`,
    draft: false,
    prerelease: false,
    generate_release_notes: true
  };

  const createResponse = await fetch(createReleaseUrl, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'RIESCADE-Release-Script',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify(releasePayload)
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create release: ${createResponse.status} ${createResponse.statusText}\n${errorText}`);
  }

  const releaseData = await createResponse.json();
  const uploadUrlTemplate = releaseData.upload_url;
  const releaseId = releaseData.id;
  console.log(`✅ GitHub Release created (ID: ${releaseId})`);

  // 6. Upload RIESCADE_OS.7z to GitHub Release
  const assetUploadUrl = uploadUrlTemplate.replace(/\{.*?\}/, '') + `?name=RIESCADE_OS.7z`;
  console.log(`📤 Uploading RIESCADE_OS.7z to release assets...`);
  const fileStream = fs.createReadStream(zipPath);
  const fileSize = fs.statSync(zipPath).size;

  const uploadResponse = await fetch(assetUploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/x-7z-compressed',
      'Content-Length': fileSize.toString(),
      'User-Agent': 'RIESCADE-Release-Script',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    duplex: 'half',
    body: fileStream
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Failed to upload asset RIESCADE_OS.7z: ${uploadResponse.status} ${uploadResponse.statusText}\n${errorText}`);
  }
  console.log(`   ✓ RIESCADE_OS.7z uploaded successfully.`);

  console.log(`\n🎉 Release v${version} successfully completed and published to GitHub!`);
}

run().catch(err => {
  console.error('\n\x1b[31m❌ Release failed:\x1b[0m');
  console.error(err.message || err);
  process.exit(1);
});
