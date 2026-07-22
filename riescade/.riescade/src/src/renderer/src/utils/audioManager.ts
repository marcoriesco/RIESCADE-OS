// Navigation & UI Sound Synthesizer & Audio File Player

export type SoundType =
  | 'navigate'
  | 'click'
  | 'click2'
  | 'select'
  | 'back'
  | 'tab_switch'
  | 'game_launch'
  | 'favorite_add'
  | 'favorite_remove'
  | 'toggle_on'
  | 'toggle_off'
  | 'error';

let audioCtx: AudioContext | null = null;
let musicBasePath: string | null = null;
const audioCache = new Map<string, HTMLAudioElement>();

export async function playUISound(
  type: SoundType = 'navigate',
  masterVolume = 80,
  enabled = true
) {
  if (!enabled || masterVolume <= 0) return;

  const vol = Math.max(0, Math.min(1, masterVolume / 100));

  // Try playing pre-generated audio file from /music folder
  try {
    if (!musicBasePath && window.api?.getMusicPath) {
      musicBasePath = await window.api.getMusicPath();
    }

    if (musicBasePath) {
      const cleanPath = musicBasePath.replace(/\\/g, '/');
      const soundFileUrl = `file:///${cleanPath}/${type}.mp3`;

      let audio = audioCache.get(type);
      if (!audio) {
        audio = new Audio(soundFileUrl);
        audioCache.set(type, audio);
      }

      audio.volume = vol;
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise;
        return; // Successfully played audio file!
      }
    }
  } catch (e) {
    // Fall back to Web Audio API synthesizer
  }

  // Fallback: Web Audio API Oscillator synthesis
  try {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) audioCtx = new AudioCtx();
    }
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    const baseVol = Math.max(0, Math.min(1, vol * 0.08));

    if (type === 'navigate' || type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.035);
      gain.gain.setValueAtTime(baseVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.035);
    } else if (type === 'click2') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(550, now);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.035);
      gain.gain.setValueAtTime(baseVol * 1.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.035);
    } else if (type === 'select') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.055);
      gain.gain.setValueAtTime(baseVol * 1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.start(now);
      osc.stop(now + 0.055);
    } else if (type === 'back') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.045);
      gain.gain.setValueAtTime(baseVol * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      osc.start(now);
      osc.stop(now + 0.045);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(baseVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    }
  } catch (e) {
    // Ignore audio errors
  }
}

