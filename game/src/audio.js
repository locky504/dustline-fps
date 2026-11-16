// Procedural sound: every effect is synthesized with WebAudio, so the game ships no
// audio files. Created lazily on the first user gesture; silent when the browser
// cannot start an AudioContext (headless captures included).
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx || !enabled) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { enabled = false; return null; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      enabled = false;
      return null;
    }
    return ctx;
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst(freq, duration, gain, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(g).connect(master);
    source.start(t);
    source.stop(t + duration);
  }

  function tone(freq, duration, gain, type = 'sine', slideTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    shot(kind) {
      if (kind === 'longbow') { burst(900, 0.22, 0.9); tone(120, 0.18, 0.5, 'sine', 40); }
      else if (kind === 'breacher') { burst(700, 0.25, 1.0); tone(90, 0.2, 0.6, 'sine', 35); }
      else if (kind === 'kestrel') { burst(1800, 0.07, 0.5); tone(220, 0.06, 0.25, 'square', 90); }
      else { burst(1400, 0.1, 0.7); tone(180, 0.09, 0.35, 'square', 70); }
    },
    dryClick() { tone(1200, 0.03, 0.2, 'square'); },
    reload() { tone(500, 0.05, 0.25, 'square'); setTimeout(() => tone(700, 0.05, 0.25, 'square'), 350); },
    hit() { tone(1400, 0.05, 0.3, 'sine'); },
    kill() { tone(880, 0.08, 0.3, 'sine'); setTimeout(() => tone(1320, 0.12, 0.3, 'sine'), 70); },
    hurt() { tone(160, 0.15, 0.4, 'sawtooth', 60); },
    explosion() { burst(300, 0.9, 1.0); tone(60, 0.8, 0.8, 'sine', 25); },
    beep(final = false) { tone(final ? 1600 : 1000, 0.09, 0.3, 'sine'); },
    plant() { tone(1000, 0.1, 0.3, 'sine'); setTimeout(() => tone(1000, 0.1, 0.3, 'sine'), 150); },
    roundWin() { tone(523, 0.14, 0.3, 'sine'); setTimeout(() => tone(659, 0.14, 0.3, 'sine'), 130); setTimeout(() => tone(784, 0.22, 0.3, 'sine'), 260); },
    roundLose() { tone(392, 0.18, 0.3, 'sine'); setTimeout(() => tone(311, 0.28, 0.3, 'sine'), 170); },
    buy() { tone(980, 0.06, 0.25, 'sine'); setTimeout(() => tone(1240, 0.08, 0.25, 'sine'), 60); },
    denied() { tone(220, 0.12, 0.3, 'square'); },
  };
}
