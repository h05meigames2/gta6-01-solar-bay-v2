// Procedural WebAudio for SOLAR BAY: engine, siren, shots, chimes, ambient pad.
// No audio files — everything is synthesized. Written for this game.
export class Sound {
  constructor() {
    this.ctx = null; this.master = null; this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.padTimer = 0; this.muted = false;
    this.chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [146.8, 220, 293.7]];
    this.chordIdx = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination);
      // Engine: sawtooth + lowpass, gain by speed.
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 60;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: two-tone triangle.
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } catch (e) { this.ctx = null; }
  }
  setEngine(speed01, driving) {
    if (!this.ctx) return;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.09 : 0, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 140, this.ctx.currentTime, 0.08);
  }
  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
    if (on) this.sirenOsc.frequency.setTargetAtTime(650 + Math.sin(this.ctx.currentTime * 4) * 220, this.ctx.currentTime, 0.05);
  }
  blip(freq, dur, type = 'sine', vol = 0.2) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  noise(dur, vol = 0.3, freq = 1200) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }
  shot() { this.noise(0.14, 0.4, 900); this.blip(160, 0.1, 'square', 0.15); }
  punch() { this.noise(0.08, 0.25, 300); }
  cash() { this.blip(880, 0.12); setTimeout(() => this.blip(1318, 0.18), 90); }
  busted() { this.blip(220, 0.5, 'sawtooth', 0.2); setTimeout(() => this.blip(165, 0.6, 'sawtooth', 0.2), 200); }
  click() { this.blip(600, 0.05, 'square', 0.1); }
  // Slow ambient pad: one soft chord every 6s while playing.
  pad(dt) {
    if (!this.ctx) return;
    this.padTimer += dt;
    if (this.padTimer < 6) return;
    this.padTimer = 0;
    const chord = this.chords[this.chordIdx % this.chords.length]; this.chordIdx++;
    for (const f of chord) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.035, this.ctx.currentTime + 1.2);
      g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 5.5);
      o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + 5.6);
    }
  }
}
