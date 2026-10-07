// Apple Notification Sound Synthesizer using Web Audio API
// Generates authentic iOS chime sound without needing external mp3 files

class AppleSoundPlayer {
  constructor() {
    this.audioCtx = null;
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  // Play the iconic Apple iOS Tri-Tone chime
  playAppleChime() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Authentic Apple Tri-Tone: C6 (1046.5Hz) -> E6 (1318.5Hz) -> G6 (1567.98Hz)
      const notes = [
        { freq: 1046.5, start: 0, duration: 0.12, gain: 0.4 },
        { freq: 1318.5, start: 0.11, duration: 0.12, gain: 0.45 },
        { freq: 1567.98, start: 0.22, duration: 0.42, gain: 0.55 }
      ];

      notes.forEach(({ freq, start, duration, gain }) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        // Sine wave for pure bell tone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + start);

        // Envelope: immediate strike, smooth exponential decay like Apple chime
        gainNode.gain.setValueAtTime(0.001, now + start);
        gainNode.gain.linearRampToValueAtTime(gain, now + start + 0.012);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + start);
        osc.stop(now + start + duration + 0.05);

        // Add subtle harmonic overtone for marimba/glass body
        const overtone = ctx.createOscillator();
        const overtoneGain = ctx.createGain();
        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 2, now + start);
        overtoneGain.gain.setValueAtTime(0.001, now + start);
        overtoneGain.gain.linearRampToValueAtTime(gain * 0.18, now + start + 0.008);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration * 0.7);

        overtone.connect(overtoneGain);
        overtoneGain.connect(ctx.destination);

        overtone.start(now + start);
        overtone.stop(now + start + duration * 0.7 + 0.05);
      });
    } catch (err) {
      console.warn('Apple sound playback notice:', err);
    }
  }

  // Modern iOS "Note" bell ping
  playAppleBell() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Two bell tones struck together (F6 + A6)
      const freqs = [1396.91, 1760.0];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.4 / (idx + 1), now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
      });
    } catch (err) {
      console.warn('Apple bell notice:', err);
    }
  }
}

export const appleSound = new AppleSoundPlayer();
