// Navigation & UI Sound Synthesizer using Web Audio API

let audioCtx: AudioContext | null = null;

export function playUISound(type: 'navigate' | 'select' | 'back', masterVolume = 80, enabled = true) {
  if (!enabled || masterVolume <= 0) return;
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
    const vol = Math.max(0, Math.min(1, (masterVolume / 100) * 0.08));

    if (type === 'navigate') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.035);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.035);
    } else if (type === 'select') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.055);
      gain.gain.setValueAtTime(vol * 1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.start(now);
      osc.stop(now + 0.055);
    } else if (type === 'back') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.045);
      gain.gain.setValueAtTime(vol * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      osc.start(now);
      osc.stop(now + 0.045);
    }
  } catch (e) {
    // Ignore audio context errors
  }
}
