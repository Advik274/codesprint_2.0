import { useCallback, useState } from 'react';

// All sound effects are synthesized with the Web Audio API — no external
// audio files to host or license. Browsers require a user gesture before
// audio can play, so the context is created lazily on first use (a click
// on the spectator page, an admin toast trigger, etc. all count).
let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq, duration, type = 'sine', gain = 0.15, startAt = 0, glideTo = null }) {
  const audioCtx = getCtx();
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startAt);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, audioCtx.currentTime + startAt + duration);
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime + startAt);
  gainNode.gain.linearRampToValueAtTime(gain, audioCtx.currentTime + startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startAt + duration);
  osc.connect(gainNode).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + startAt);
  osc.stop(audioCtx.currentTime + startAt + duration + 0.05);
}

const MUTE_KEY = 'dominance_sound_muted';

function isMuted() {
  return localStorage.getItem(MUTE_KEY) === '1';
}

const effects = {
  capture: () => { tone({ freq: 440, duration: 0.12, type: 'triangle', gain: 0.18 }); tone({ freq: 660, duration: 0.18, type: 'triangle', gain: 0.18, startAt: 0.1 }); },
  eliminate: () => { tone({ freq: 220, duration: 0.4, type: 'sawtooth', gain: 0.15, glideTo: 80 }); },
  tick: () => { tone({ freq: 880, duration: 0.06, type: 'square', gain: 0.08 }); },
  roundStart: () => { tone({ freq: 523, duration: 0.1, gain: 0.15 }); tone({ freq: 784, duration: 0.15, gain: 0.15, startAt: 0.12 }); },
  winner: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, duration: 0.3, type: 'triangle', gain: 0.2, startAt: i * 0.14 }));
  },
  alert: () => { tone({ freq: 660, duration: 0.1, type: 'square', gain: 0.15 }); tone({ freq: 660, duration: 0.1, type: 'square', gain: 0.15, startAt: 0.15 }); },
};

export function useSound() {
  const [muted, setMuted] = useState(isMuted);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m;
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const play = useCallback((name) => {
    if (isMuted()) return;
    try { effects[name]?.(); } catch { /* audio unsupported/blocked — fail silently */ }
  }, []);

  return { muted, toggleMute, play };
}
