const STORAGE_KEY = 'arenaAudioSettings';

const DEFAULT_SETTINGS = {
  music: true,
  effects: true,
  musicVolume: 0.42,
  effectsVolume: 0.72,
  ambienceVolume: 0.35,
  reducedFx: false
};

const state = {
  context: null,
  master: null,
  musicGain: null,
  fxGain: null,
  ambienceGain: null,
  scene: 'HOME',
  started: false,
  beatTimer: null,
  ambienceTimer: null,
  settings: loadAudioSettings()
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value)));
}

function loadAudioSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveAudioSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  window.dispatchEvent(new CustomEvent('arena-audio-settings', { detail: { ...state.settings } }));
}

function ensureContext() {
  if (state.context) return state.context;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const context = new AudioContext();
  state.context = context;
  state.master = context.createGain();
  state.musicGain = context.createGain();
  state.fxGain = context.createGain();
  state.ambienceGain = context.createGain();
  state.musicGain.connect(state.master);
  state.fxGain.connect(state.master);
  state.ambienceGain.connect(state.master);
  state.master.connect(context.destination);
  applyGains();
  return context;
}

function applyGains() {
  if (!state.context) return;
  const now = state.context.currentTime;
  state.musicGain.gain.setTargetAtTime(state.settings.music ? clamp(state.settings.musicVolume) : 0, now, 0.08);
  state.fxGain.gain.setTargetAtTime(state.settings.effects ? clamp(state.settings.effectsVolume) : 0, now, 0.03);
  state.ambienceGain.gain.setTargetAtTime(state.settings.music ? clamp(state.settings.ambienceVolume) : 0, now, 0.15);
}

function tone({ frequency = 440, duration = 0.12, type = 'triangle', gain = 0.12, dest = state.fxGain, when = 0, slideTo = null }) {
  const context = ensureContext();
  if (!context || !dest) return;
  const start = context.currentTime + when;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.025, duration * 0.25));
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(dest);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function noise({ duration = 0.18, gain = 0.08, dest = state.fxGain, filter = 900, when = 0 }) {
  const context = ensureContext();
  if (!context || !dest) return;
  const start = context.currentTime + when;
  const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  const source = context.createBufferSource();
  const envelope = context.createGain();
  const biquad = context.createBiquadFilter();
  source.buffer = buffer;
  biquad.type = 'lowpass';
  biquad.frequency.value = filter;
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(biquad);
  biquad.connect(envelope);
  envelope.connect(dest);
  source.start(start);
}

function beatProfile(scene) {
  return {
    HOME: { bpm: 76, bass: 88, chord: 220, energy: 0.35 },
    LOBBY: { bpm: 92, bass: 98, chord: 247, energy: 0.5 },
    COUNTDOWN: { bpm: 104, bass: 73, chord: 196, energy: 0.62 },
    QUESTION: { bpm: 86, bass: 82, chord: 174, energy: 0.34 },
    CRITICAL: { bpm: 118, bass: 110, chord: 277, energy: 0.72 },
    VOTING: { bpm: 96, bass: 92, chord: 233, energy: 0.46 },
    REVEAL: { bpm: 108, bass: 123, chord: 311, energy: 0.66 },
    WINNER: { bpm: 124, bass: 130, chord: 330, energy: 0.9 },
    FINAL: { bpm: 110, bass: 98, chord: 262, energy: 0.7 }
  }[scene] || { bpm: 86, bass: 82, chord: 220, energy: 0.35 };
}

function scheduleMusicPulse() {
  clearInterval(state.beatTimer);
  if (!state.settings.music || state.settings.reducedFx) return;
  const profile = beatProfile(state.scene);
  const interval = Math.max(260, 60000 / profile.bpm);
  let step = 0;
  state.beatTimer = setInterval(() => {
    if (!state.settings.music) return;
    const strong = step % 4 === 0;
    tone({ frequency: strong ? profile.bass : profile.bass * 1.5, duration: strong ? 0.18 : 0.08, type: 'sine', gain: profile.energy * (strong ? 0.13 : 0.035), dest: state.musicGain, slideTo: strong ? profile.bass * 0.5 : null });
    if (step % 8 === 2) tone({ frequency: profile.chord, duration: 0.22, type: 'triangle', gain: profile.energy * 0.035, dest: state.musicGain });
    if (profile.energy > 0.55 && step % 4 === 3) noise({ duration: 0.08, gain: profile.energy * 0.022, filter: 4200, dest: state.musicGain });
    window.dispatchEvent(new CustomEvent('arena-beat', { detail: { scene: state.scene, strong } }));
    step = (step + 1) % 16;
  }, interval);
}

function scheduleAmbience() {
  clearInterval(state.ambienceTimer);
  if (!state.settings.music || state.settings.reducedFx) return;
  state.ambienceTimer = setInterval(() => {
    if (!state.settings.music) return;
    noise({ duration: 1.2, gain: 0.012, filter: 700, dest: state.ambienceGain });
    if (Math.random() > 0.58) tone({ frequency: 520 + Math.random() * 240, duration: 0.06, type: 'sine', gain: 0.015, dest: state.ambienceGain });
  }, 2400);
}

export function startAudio() {
  const context = ensureContext();
  if (!context) return;
  context.resume?.();
  if (!state.started) {
    state.started = true;
    scheduleMusicPulse();
    scheduleAmbience();
  }
}

export function setAudioScene(scene) {
  const changed = state.scene !== scene;
  state.scene = scene;
  startAudio();
  applyGains();
  if (changed) {
    scheduleMusicPulse();
    scheduleAmbience();
  }
}

export function playArenaSound(type) {
  if (!state.settings.effects) return;
  startAudio();
  const map = {
    hover: () => tone({ frequency: 620, duration: 0.045, gain: 0.025 }),
    click: () => tone({ frequency: 440, duration: 0.065, gain: 0.055, slideTo: 660 }),
    create: () => { tone({ frequency: 110, duration: 0.18, type: 'sine', gain: 0.12, slideTo: 55 }); tone({ frequency: 660, duration: 0.12, gain: 0.055, when: 0.04 }); },
    join: () => { tone({ frequency: 392, duration: 0.1, gain: 0.055 }); tone({ frequency: 784, duration: 0.12, gain: 0.045, when: 0.08 }); },
    start: () => { tone({ frequency: 147, duration: 0.22, type: 'sawtooth', gain: 0.12, slideTo: 74 }); noise({ duration: 0.12, gain: 0.06, filter: 3200 }); },
    tick: () => tone({ frequency: 760, duration: 0.055, type: 'square', gain: 0.045 }),
    go: () => { tone({ frequency: 98, duration: 0.26, type: 'sine', gain: 0.16, slideTo: 49 }); noise({ duration: 0.2, gain: 0.09, filter: 2600 }); },
    time: () => { tone({ frequency: 190, duration: 0.24, type: 'sawtooth', gain: 0.12, slideTo: 70 }); },
    submit: () => { tone({ frequency: 520, duration: 0.08, gain: 0.06 }); tone({ frequency: 880, duration: 0.1, gain: 0.05, when: 0.05 }); },
    vote: () => { tone({ frequency: 180, duration: 0.09, type: 'sine', gain: 0.09 }); noise({ duration: 0.05, gain: 0.05, filter: 1800 }); },
    reveal: () => { tone({ frequency: 220, duration: 0.15, gain: 0.06 }); tone({ frequency: 330, duration: 0.18, gain: 0.06, when: 0.12 }); tone({ frequency: 660, duration: 0.28, gain: 0.06, when: 0.24 }); },
    victory: () => { tone({ frequency: 130, duration: 0.3, type: 'sine', gain: 0.17, slideTo: 65 }); tone({ frequency: 523, duration: 0.12, gain: 0.07 }); tone({ frequency: 659, duration: 0.12, gain: 0.07, when: 0.12 }); tone({ frequency: 784, duration: 0.18, gain: 0.07, when: 0.24 }); noise({ duration: 0.55, gain: 0.035, filter: 4800, when: 0.05 }); },
    boo: () => { tone({ frequency: 140, duration: 0.34, type: 'sawtooth', gain: 0.09, slideTo: 95 }); noise({ duration: 0.35, gain: 0.055, filter: 600 }); },
    rank: () => { tone({ frequency: 392, duration: 0.12, gain: 0.07 }); tone({ frequency: 784, duration: 0.22, gain: 0.08, when: 0.08 }); }
  };
  (map[type] || map.click)();
}

export function updateAudioSettings(patch = {}) {
  state.settings = {
    ...state.settings,
    ...patch,
    musicVolume: clamp(patch.musicVolume ?? state.settings.musicVolume),
    effectsVolume: clamp(patch.effectsVolume ?? state.settings.effectsVolume),
    ambienceVolume: clamp(patch.ambienceVolume ?? state.settings.ambienceVolume)
  };
  saveAudioSettings();
  applyGains();
  scheduleMusicPulse();
  scheduleAmbience();
  return getAudioSettings();
}

export function getAudioSettings() {
  return { ...state.settings };
}
