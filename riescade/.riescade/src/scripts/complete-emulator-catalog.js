const fs = require('fs')
const path = require('path')

const appRoot = path.resolve(__dirname, '..', '..')
const projectRoot = path.resolve(appRoot, '..', '..')
const systemsPath = path.join(appRoot, 'configs', 'systems.json')
const catalogPath = path.join(appRoot, 'configs', 'emulators-catalog.json')
const emulatorsPath = path.join(projectRoot, 'emulators')

const folderOverrides = {
  cxbx: 'cxbx-reloaded',
  dolphin: 'dolphin-emu',
  libretro: 'retroarch',
  model2: 'm2emulator',
  retroarchcc: 'retroarchCC'
}

const executableOverrides = {
  altirra: 'altirra/Altirra64.exe',
  amigaforever: 'amigaforever/AmigaForever.exe',
  applewin: 'applewin/AppleWin.exe',
  arcadeflashweb: 'arcadeflashweb/ArcadeFlashWeb.exe',
  azahar: 'azahar/azahar.exe',
  bigpemu: 'bigpemu/BigPEmu.exe',
  bizhawk: 'bizhawk/EmuHawk.exe',
  capriceforever: 'capriceforever/Caprice64.exe',
  chihiro: 'chihiro/cxbxr-ldr.exe',
  'chihiro-gun': 'chihiro/cxbxr-ldr.exe',
  citra: 'citra/citra-qt.exe',
  cxbx: 'cxbx-reloaded/cxbxr-ldr.exe',
  daphne: 'daphne/daphne.exe',
  demul: 'demul/demul.exe',
  desmume: 'desmume/DeSmuME-VS2022-x64-Release.exe',
  devilutionx: 'devilutionx/devilutionx.exe',
  dhewm3: 'dhewm3/dhewm3.exe',
  'dolphin-triforce': 'dolphin-triforce/Dolphin.exe',
  dosbox: 'dosbox/dosbox.exe',
  'dosbox-pure': 'dosbox-pure/DOSBoxPure.exe',
  'dosbox-staging': 'dosbox-staging/dosbox.exe',
  fbneo: 'fbneo/fbneo64.exe',
  fpinball: 'fpinball/Future Pinball.exe',
  gopher64: 'gopher64/gopher64-windows-x86_64.exe',
  gsplus: 'gsplus/gsplus.exe',
  gzdoom: 'gzdoom/gzdoom.exe',
  jgenesis: 'jgenesis/jgenesis-cli.exe',
  jynx: 'jynx/Jynx-Windows-64bit.exe',
  jzintv: 'jzintv/jzintv.exe',
  'kega-fusion': 'kega-fusion/Fusion.exe',
  linuxloader: 'linuxloader/linuxloader.exe',
  m2emulator: 'm2emulator/EMULATOR.EXE',
  mandarine: 'mandarine/mandarine-qt.exe',
  melonds: 'melonds/melonDS.exe',
  mesen: 'mesen/Mesen.exe',
  mgba: 'mgba/mgba.exe',
  mupen64: 'mupen64/RMG.exe',
  n64recomplauncher: 'n64recomplauncher/GithubLauncher.exe',
  nosgba: 'nosgba/no$gba.exe',
  openbor: 'openbor/OpenBOR.exe',
  opengoal: 'opengoal/gk.exe',
  openmsx: 'openmsx/openmsx.exe',
  oricutron: 'oricutron/Oricutron.exe',
  pcsx2: 'pcsx2/pcsx2-qt.exe',
  'pcsx2-16': 'pcsx2-16/pcsx2.exe',
  pcsx2x6: 'pcsx2x6/pcsx2-qt.exe',
  pdark: 'pdark/pd.x86_64.exe',
  pico8: 'pico8/pico8.exe',
  play: 'play/Play.exe',
  ppsspp: 'ppsspp/PPSSPPWindows64.exe',
  project64: 'project64/Project64.exe',
  psxmame: 'psxmame/mame.exe',
  raine: 'raine/raine.exe',
  raze: 'raze/raze.exe',
  retroarchcc: 'retroarchCC/retroarch.exe',
  rpcs3: 'rpcs3/rpcs3.exe',
  rtcw: 'rtcw/RealRTCW.x64.exe',
  ruffle: 'ruffle/ruffle.exe',
  scummvm: 'scummvm/scummvm.exe',
  simple64: 'simple64/simple64-gui.exe',
  singe2: 'singe2/Singe-v2.10-Windows-x86_64.exe',
  snes9x: 'snes9x/snes9x-x64.exe',
  soh: 'soh/soh.exe',
  solarus: 'solarus/solarus-run.exe',
  sonic3air: 'sonic3air/Sonic3AIR.exe',
  sonicmania: 'sonicmania/RSDKv5U_x64.exe',
  sonicretrocd: 'sonicretrocd/RSDKv3_64.exe',
  ssf: 'ssf/SSF64.exe',
  starship: 'starship/Starship.exe',
  stella: 'stella/Stella.exe',
  sudachi: 'sudachi/sudachi.exe',
  teknoparrot: 'teknoparrot/TeknoParrotUi.exe',
  theforceengine: 'theforceengine/TheForceEngine.exe',
  tsugaru: 'tsugaru/Tsugaru_CUI.exe',
  vpinball: 'vpinball/VPinballX.exe',
  vkquake: 'vkquake/vkquake.exe',
  vkquake2: 'vkquake2/vkquake2.exe',
  winuae: 'winuae/winuae64.exe',
  xash3d: 'xash3d/xash3d.exe',
  'xenia-canary': 'xenia-canary/xenia_canary.exe',
  'xenia-edge': 'xenia-edge/xenia_edge.exe',
  'xenia-manager': 'xenia-manager/xenia-manager.exe',
  xm6pro: 'xm6pro/XM6.exe',
  xroar: 'xroar/xroar.exe',
  yabasanshiro: 'yabasanshiro/yabasanshiro.exe',
  ymir: 'ymir/ymir-sdl3.exe',
  yuzu: 'yuzu/yuzu.exe',
  zaccariapinball: 'zaccariapinball/ZaccariaPinball.exe',
  zesarux: 'zesarux/zesarux.exe',
  zinc: 'zinc/ZiNc.exe'
}

// Only repositories with an official release channel and downloadable Windows
// archives belong here. Source-only repositories stay in manual mode.
const githubReleases = {
  ares: ['ares-emulator/ares', '^ares-windows.*x86_64(?!.*PDB).*\\.zip$'],
  applewin: ['AppleWin/AppleWin', '(AppleWin).*(zip)$'],
  azahar: ['azahar-emu/azahar', 'azahar-windows-(mxe|msys2).*\\.zip$'],
  bizhawk: ['TASEmulators/BizHawk', '(win|windows|BizHawk).*(x64|64).*\\.zip$'],
  bstone: ['bibendovsky/bstone', '(windows|win).*(x64|64).*\\.zip$'],
  cemu: ['cemu-project/Cemu', 'cemu-.*windows.*x64.*\\.zip$'],
  citron: ['citron-neo/emulator', '(windows|win).*(x64|64).*\\.zip$'],
  corsixth: ['CorsixTH/CorsixTH', '(windows|win).*(x64|64).*\\.zip$'],
  desmume: ['TASEmulators/desmume', '(windows|win).*(x64|64).*\\.zip$'],
  devilutionx: ['diasurgical/devilutionX', 'devilutionx-windows-x86_64\\.zip$'],
  'dosbox-staging': ['dosbox-staging/dosbox-staging', '(windows|win).*(x64|64).*\\.zip$'],
  eka2l1: ['EKA2L1/EKA2L1', '(windows|win).*(x64|64).*\\.zip$'],
  flycast: ['flyinghead/flycast', '(windows|win).*(x64|64).*\\.zip$'],
  gzdoom: ['ZDoom/gzdoom', '^gzdoom-.*-windows\\.zip$'],
  hypseus: ['DirtBagXon/hypseus-singe', '(windows|win).*(x64|64).*\\.zip$'],
  jgenesis: ['jsgroth/jgenesis', '(windows|win).*(x64|64).*\\.zip$'],
  love: ['love2d/love', 'love-.*win64\\.zip$'],
  melonds: ['melonDS-emu/melonDS', '^melonDS-.*-windows-x86_64\\.zip$'],
  mesen: ['SourMesen/Mesen2', 'Mesen.*Windows.*\\.zip$'],
  mgba: ['mgba-emu/mgba', '(windows|win).*(x64|64).*\\.7z$'],
  mupen64: ['Rosalie241/RMG', 'RMG-Portable-Windows64.*\\.zip$'],
  pcsx2: ['PCSX2/pcsx2', '^pcsx2-.*-windows-x64-Qt\\.7z$'],
  pcsx2x6: ['PS2Homebrew-arcade/pcsx2x6', '(windows|win).*(x64|64).*\\.zip$'],
  ppsspp: ['hrydgard/ppsspp', '^PPSSPP-.*-Windows-x64\\.zip$'],
  rpcs3: ['RPCS3/rpcs3-binaries-win', 'rpcs3-.*win64.*\\.7z$'],
  ruffle: ['ruffle-rs/ruffle', '^ruffle-.*-windows-x86_64\\.zip$'],
  shadps4: ['shadps4-emu/shadPS4', '^shadps4-win64-qt-.*\\.zip$'],
  simple64: ['simple64/simple64', '(windows|win).*(x64|64).*\\.zip$'],
  snes9x: ['snes9xgit/snes9x', '(windows|win).*(x64|64).*\\.zip$'],
  soh: ['HarbourMasters/Shipwright', '(windows|win).*(x64|64).*\\.zip$'],
  starship: ['HarbourMasters/Starship', '^Starship-.*-Windows\\.zip$'],
  stella: ['stella-emu/stella', 'Stella-.*windows.*\\.zip$'],
  vita3k: ['Vita3K/Vita3K', '^windows-latest\\.zip$'],
  vkquake: ['Novum/vkQuake', '^vkQuake-.*_windows_x64\\.zip$'],
  vkquake2: ['kondrak/vkQuake2', '(windows|win).*(x64|64).*\\.zip$'],
  vpinball: ['vpinball/vpinball', '^VPinballX-.*-win-x64\\.zip$'],
  xemu: ['xemu-project/xemu', '^xemu-.*-windows-x86_64\\.zip$'],
  xenia: ['xenia-project/release-builds-windows', 'xenia_master.*\\.zip$'],
  ymir: ['StrikerX3/Ymir', '^ymir-windows-x86_64-.*\\.zip$']
}

function findExistingExecutable(id, installDir) {
  const override = executableOverrides[id]
  if (override) return override
  const absoluteDir = path.join(emulatorsPath, installDir)
  if (!fs.existsSync(absoluteDir)) return ''
  const excluded = /^(uninstall|updater|crashpad|qtwebengineprocess|vc_redist|config|tool)/i
  const candidates = fs.readdirSync(absoluteDir)
    .filter(name => name.toLowerCase().endsWith('.exe') && !excluded.test(name))
  const exact = candidates.find(name => name.toLowerCase() === `${id}.exe`)
  const selected = exact || candidates[0]
  return selected ? `${installDir}/${selected}` : ''
}

const systems = JSON.parse(fs.readFileSync(systemsPath, 'utf8'))
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
catalog.$schema = 'riescade-emulators-catalog-v2'
catalog.version = 2

const referenced = [...new Set(systems.systems.flatMap(system =>
  (system.emulators || []).map(emulator => String(emulator.name).toLowerCase())
))].sort()

for (const id of referenced) {
  const current = catalog.emulators[id] || {}
  const installDir = current.installDir || folderOverrides[id] || id
  const release = githubReleases[id]
  const executable = executableOverrides[id] || current.executable || findExistingExecutable(id, installDir)
  const retainedSource = !release && current.source && current.provider !== 'github'
  catalog.emulators[id] = {
    name: current.name || id,
    installDir,
    ...(executable ? { executable } : {}),
    updateMode: release ? 'github-release' : (retainedSource ? 'release' : 'manual'),
    ...(release ? {
      source: `https://github.com/${release[0]}/releases`,
      provider: 'github',
      assetPattern: release[1]
    } : {}),
    ...(retainedSource ? { source: current.source } : {}),
    ...(retainedSource && current.provider ? { provider: current.provider } : {}),
    ...(retainedSource && current.assetPattern ? { assetPattern: current.assetPattern } : {}),
    ...(current.preserve ? { preserve: current.preserve } : {})
  }
}

catalog.emulators = Object.fromEntries(
  Object.entries(catalog.emulators).sort(([a], [b]) => a.localeCompare(b))
)

fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
console.log(`Catálogo atualizado: ${Object.keys(catalog.emulators).length} emuladores; ${Object.values(catalog.emulators).filter(item => item.updateMode === 'github-release').length} com release GitHub.`)
