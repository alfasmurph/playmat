/**
 * Sound recipes: a few layered tones, noises and clips with envelopes, filters, wobble and echo. The owner's sound
 * picker (tools/sound-picker/picker.template.html) designs them and plays them with this same engine, ported here
 * so a made sound plays in the game exactly as it did in the picker. Keep the two in step.
 */

export const WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
export const FILTERS = ['none', 'lowpass', 'highpass', 'bandpass'] as const;

export type LayerKind = 'tone' | 'noise' | 'clip';

export interface RecipeLayer {
  on: boolean;
  kind: LayerKind;
  wave: string;
  /** a clip layer's picker option id; the game looks for public/sounds/clips/<id>.mp3 */
  clipFile: string;
  rate: number;
  /** pitch from f0 to f1 over the layer (tones) */
  f0: number;
  f1: number;
  start: number;
  attack: number;
  hold: number;
  release: number;
  vol: number;
  filter: string;
  /** filter cutoff from c0 to c1 */
  c0: number;
  c1: number;
  q: number;
  vibRate: number;
  vibDepth: number;
  /** tremolo */
  wobRate: number;
  wobDepth: number;
  /** repeats, `gap` seconds apart, each `step` semitones higher and `fade` times as loud */
  reps: number;
  gap: number;
  step: number;
  fade: number;
  drive: number;
}

export interface Recipe {
  v: number;
  gain: number;
  echoTime: number;
  echoFeedback: number;
  echoMix: number;
  layers: RecipeLayer[];
}

/** A recipe as saved: any field may be missing, and normaliseRecipe fills it in. */
export type RecipeInput = Partial<Omit<Recipe, 'layers'>> & { layers?: Partial<RecipeLayer>[] };

export function newLayer(kind: LayerKind = 'tone'): RecipeLayer {
  return {
    on: true, kind, wave: 'sine', clipFile: '', rate: 1, f0: 440, f1: 440, start: 0, attack: 0.005, hold: 0.05, release: 0.2, vol: 0.8,
    filter: 'none', c0: 2000, c1: 2000, q: 1, vibRate: 0, vibDepth: 0, wobRate: 0, wobDepth: 0, reps: 1, gap: 0.08, step: 0, fade: 0.8, drive: 0,
  };
}

export function newRecipe(): Recipe {
  return { v: 1, gain: 0.8, echoTime: 0, echoFeedback: 0.3, echoMix: 0, layers: [newLayer('tone')] };
}

/** Every field present, at most four layers. */
export function normaliseRecipe(r: RecipeInput | null | undefined): Recipe {
  const base = newRecipe();
  const out = { ...base, ...(r || {}) } as Recipe;
  out.layers = ((r && r.layers) || base.layers).slice(0, 4).map((l) => ({ ...newLayer(l && l.kind), ...l }));
  return out;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise from a fixed seed, so a noisy recipe sounds the same every time. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (b) return b;
  const n = Math.floor(ctx.sampleRate * 2);
  b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 22222;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (s / 0x3fffffff) - 1;
  }
  noiseCache.set(ctx, b);
  return b;
}

const driveCurves = new Map<number, Float32Array<ArrayBuffer>>();

/** A soft-clipping curve for the drive: 0 is clean, 1 is crunchy. */
export function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = Math.round(amount * 100);
  const cached = driveCurves.get(k);
  if (cached) return cached;
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  driveCurves.set(k, c);
  return c;
}

/** From v0 to v1 between t0 and t1: exponential when both are above zero, linear otherwise. */
export function ramp(param: AudioParam, v0: number, v1: number, t0: number, t1: number) {
  param.setValueAtTime(v0, t0);
  if (v0 > 0 && v1 > 0) param.exponentialRampToValueAtTime(v1, Math.max(t1, t0 + 0.001));
  else param.linearRampToValueAtTime(v1, Math.max(t1, t0 + 0.001));
}

/** Seconds from the start to the end of the last layer, plus the echo's tail. */
export function recipeLength(recipe: RecipeInput | null | undefined): number {
  const r = normaliseRecipe(recipe);
  let end = 0;
  for (const l of r.layers) if (l.on) end = Math.max(end, l.start + (l.reps - 1) * l.gap + l.attack + l.hold + l.release);
  if (r.echoMix > 0 && r.echoTime > 0) end += r.echoTime * Math.min(8, 1 + Math.log(0.01) / Math.log(Math.max(0.05, r.echoFeedback)));
  return end;
}

/** The clip option ids a recipe's playing layers use. */
export function recipeClipIds(recipe: RecipeInput | null | undefined): string[] {
  const ids = normaliseRecipe(recipe).layers.filter((l) => l.on && l.kind === 'clip' && l.clipFile).map((l) => l.clipFile);
  return [...new Set(ids)];
}

/**
 * Plays a recipe into dest at `when`; clips maps a clip option id to its decoded AudioBuffer (a clip layer without
 * one stays silent). Returns the end time.
 */
export function playRecipe(ctx: BaseAudioContext, dest: AudioNode, recipe: RecipeInput, when = ctx.currentTime, clips: Record<string, AudioBuffer> = {}): number {
  const r = normaliseRecipe(recipe);
  const bus = ctx.createGain();
  bus.gain.value = r.gain;
  bus.connect(dest);
  if (r.echoMix > 0 && r.echoTime > 0) {
    const d = ctx.createDelay(1.5);
    d.delayTime.value = r.echoTime;
    const fb = ctx.createGain();
    fb.gain.value = Math.min(0.9, r.echoFeedback);
    const wet = ctx.createGain();
    wet.gain.value = r.echoMix;
    bus.connect(d);
    d.connect(fb);
    fb.connect(d);
    d.connect(wet);
    wet.connect(dest);
  }
  let end = when;
  for (const l of r.layers) {
    if (!l.on) continue;
    for (let i = 0; i < Math.max(1, Math.round(l.reps)); i++) {
      const t0 = when + l.start + i * l.gap;
      const t1 = t0 + l.attack + l.hold + l.release;
      end = Math.max(end, t1);
      const k = Math.pow(2, (l.step * i) / 12);
      let src: AudioBufferSourceNode | OscillatorNode;
      if (l.kind === 'clip') {
        const buf = clips[l.clipFile];
        if (!buf) continue;
        const clip = ctx.createBufferSource();
        clip.buffer = buf;
        clip.playbackRate.value = Math.max(0.05, l.rate * k);
        src = clip;
      } else if (l.kind === 'noise') {
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer(ctx);
        noise.loop = true;
        noise.playbackRate.value = Math.max(0.05, k);
        src = noise;
      } else {
        const osc = ctx.createOscillator();
        osc.type = (WAVES as readonly string[]).includes(l.wave) ? (l.wave as OscillatorType) : 'sine';
        ramp(osc.frequency, Math.max(1, l.f0 * k), Math.max(1, l.f1 * k), t0, t1);
        src = osc;
      }
      if (l.vibRate > 0 && l.vibDepth > 0 && src.detune) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = l.vibRate;
        const g = ctx.createGain();
        g.gain.value = l.vibDepth;
        lfo.connect(g);
        g.connect(src.detune);
        lfo.start(t0);
        lfo.stop(t1 + 0.05);
      }
      let head: AudioNode = src;
      if (l.drive > 0) {
        const ws = ctx.createWaveShaper();
        ws.curve = driveCurve(l.drive);
        ws.oversample = '2x';
        head.connect(ws);
        head = ws;
      }
      if (l.filter !== 'none' && (FILTERS as readonly string[]).includes(l.filter)) {
        const f = ctx.createBiquadFilter();
        f.type = l.filter as BiquadFilterType;
        f.Q.value = l.q;
        ramp(f.frequency, Math.max(20, l.c0), Math.max(20, l.c1), t0, t1);
        head.connect(f);
        head = f;
      }
      const env = ctx.createGain();
      const peak = l.vol * Math.pow(l.fade, i);
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(peak, t0 + Math.max(0.002, l.attack));
      env.gain.setValueAtTime(peak, t0 + Math.max(0.002, l.attack) + l.hold);
      env.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.001);
      head.connect(env);
      head = env;
      if (l.wobRate > 0 && l.wobDepth > 0) {
        const trem = ctx.createGain();
        trem.gain.value = 1 - l.wobDepth / 2;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = l.wobRate;
        const g = ctx.createGain();
        g.gain.value = l.wobDepth / 2;
        lfo.connect(g);
        g.connect(trem.gain);
        lfo.start(t0);
        lfo.stop(t1 + 0.05);
        head.connect(trem);
        head = trem;
      }
      head.connect(bus);
      src.start(t0);
      src.stop(t1 + 0.05);
    }
  }
  return end;
}
