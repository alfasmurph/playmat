/**
 * Synthesized sound pieces, built with Web Audio: tones, bells, knocks, thuds and filtered noise, short and quiet, felt
 * more than heard. Career builds its sounds and music from them; the game's cues are the owner's picks (sound.ts).
 */

export interface Bus {
  ctx: AudioContext;
  input: GainNode;
  noise: AudioBuffer;
}

interface ToneOptions {
  freq: number;
  start: number;
  length: number;
  type?: OscillatorType;
  gain?: number;
  /** glide to this frequency over the tone */
  slide?: number;
  attack?: number;
  detune?: number;
}

export function tone({ ctx }: Bus, out: AudioNode, { freq, start, length, type = 'sine', gain = 0.3, slide, attack = 0.008, detune = 0 }: ToneOptions) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, start + length);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

/** A small bell: a few inharmonic partials that die away at different speeds. */
export function bell(b: Bus, out: AudioNode, freq: number, start: number, length: number, gain: number) {
  const partials: [number, number, number][] = [[1, 1, 1], [2.01, 0.42, 0.6], [3.02, 0.2, 0.4], [4.17, 0.1, 0.28]];
  for (const [ratio, level, decay] of partials) {
    tone(b, out, { freq: freq * ratio, start, length: length * decay, gain: gain * level, attack: 0.004 });
  }
}

/** Filtered noise: felt, paper, breath. */
export function noise(b: Bus, out: AudioNode, { start, length, from, to, gain = 0.25, type = 'bandpass', q = 1.2 }: {
  start: number;
  length: number;
  from: number;
  to: number;
  gain?: number;
  type?: BiquadFilterType;
  q?: number;
}) {
  const { ctx } = b;
  const source = ctx.createBufferSource();
  source.buffer = b.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + length);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, length / 3));
  env.gain.exponentialRampToValueAtTime(0.0001, start + length);
  source.connect(filter).connect(env).connect(out);
  source.start(start, Math.random() * 0.4, length + 0.05);
}

/** A knock on wood: a quick pitched click with a little body. */
export function knock(b: Bus, out: AudioNode, freq: number, start: number, gain: number) {
  tone(b, out, { freq, start, length: 0.07, type: 'triangle', gain, attack: 0.002, slide: freq * 0.82 });
  noise(b, out, { start, length: 0.03, from: freq * 3, to: freq * 2, gain: gain * 0.5, q: 3 });
}

/** A thud on felt: low and soft, more pressure than pitch. */
export function thud(b: Bus, out: AudioNode, start: number, gain: number, freq = 95) {
  tone(b, out, { freq, start, length: 0.22, gain, attack: 0.003, slide: freq * 0.5 });
  noise(b, out, { start, length: 0.08, from: 700, to: 180, gain: gain * 0.45, type: 'lowpass', q: 0.7 });
}

export const NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, Bb4: 466.16, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5 };
