import { CueGate, type Voice } from '../../core/audio/cueGate';
import { parseManifest, playClip, recipeClipFile, type ClipAdjust, type SoundManifest } from '../../core/audio/manifest';
import { playRecipe, recipeClipIds, type Recipe } from '../../core/audio/recipe';
import { useSettings } from '../stores/settings';
import { cueAllowed, type Cue } from './cueRules';
import type { Bus } from './synthCues';

export type { Cue } from './cueRules';
export { bell, knock, noise, NOTE, thud, tone, type Bus } from './synthCues';

/**
 * Game cues. What each one plays comes from the sound manifest (public/sounds/manifest.json, from the owner's picks):
 * a recorded clip, a made sound (a recipe) or silence. A cue the manifest leaves out, or whose clip won't load, stays
 * quiet. All cues go through one bus (a
 * gentle compressor and a short room) so they sound like one set; the gate keeps bursts from piling up.
 */

let bus: Bus | null = null;

/** The one audio bus every sound goes through (game cues, Career's sounds and music). */
export function audio(): Bus | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!bus) {
    const ctx = new AudioContext();
    const input = ctx.createGain();
    // a small room: a short, dark echo under the dry sound
    const room = ctx.createDelay(0.5);
    room.delayTime.value = 0.085;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 2400;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    input.connect(room).connect(dark).connect(feedback).connect(room);
    dark.connect(wet);
    // keep peaks soft when cues overlap
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.ratio.value = 3;
    glue.attack.value = 0.004;
    glue.release.value = 0.2;
    input.connect(glue);
    wet.connect(glue);
    glue.connect(ctx.destination);
    // one second of white noise, reused by every noisy cue
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    bus = { ctx, input, noise };
  }
  // browsers start the context suspended until a user gesture; game cues always follow one
  if (bus.ctx.state === 'suspended') void bus.ctx.resume().catch(() => undefined);
  return bus;
}

const SOUNDS = `${import.meta.env.BASE_URL}sounds/`;
/** a cue whose sound takes longer than this to load is skipped (it plays in time the next time) */
const LATE_MS = 1000;
/** how long a voice's room echo rings on after its sound */
const TAIL_SECS = 0.6;
/** the cues a game plays most, loaded ahead after the first click or key */
const FREQUENT: readonly Cue[] = ['tap', 'land', 'draw', 'cast', 'resolve', 'attack', 'damage', 'decide', 'turn', 'untap'];

/** What a cue plays, ready to start: its samples decoded. */
type Sound =
  | { kind: 'silent' }
  | { kind: 'clip'; buffer: AudioBuffer; adjust: ClipAdjust }
  | { kind: 'recipe'; recipe: Recipe; clips: Record<string, AudioBuffer> };

const SILENT: Sound = { kind: 'silent' };

let manifest: Promise<SoundManifest | null> | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const sounds = new Map<Cue, Promise<Sound>>();

/** The manifest, fetched once; null when there is none (the dev server answers a missing file with the page). */
function loadManifest(): Promise<SoundManifest | null> {
  manifest ??= fetch(`${SOUNDS}manifest.json`)
    .then((response) => (response.ok ? response.json() : null))
    .then(parseManifest)
    .catch(() => null);
  return manifest;
}

/** A sample under public/sounds, decoded once; null when it is missing or not audio. */
function loadBuffer(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
  let buffer = buffers.get(file);
  if (!buffer) {
    buffer = fetch(`${SOUNDS}${file}`)
      .then((response) => {
        if (!response.ok) throw new Error(`${file}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
    buffers.set(file, buffer);
  }
  return buffer;
}

async function load(b: Bus, cue: Cue): Promise<Sound> {
  const entry = (await loadManifest())?.cues[cue];
  if (!entry) return SILENT;
  switch (entry.kind) {
    case 'silent':
      return entry;
    case 'clip': {
      const buffer = await loadBuffer(b.ctx, entry.file);
      return buffer ? { kind: 'clip', buffer, adjust: entry.adjust } : SILENT;
    }
    case 'recipe': {
      // a clip layer whose sample isn't there stays silent
      const clips: Record<string, AudioBuffer> = {};
      await Promise.all(recipeClipIds(entry.recipe).map(async (id) => {
        const file = recipeClipFile(id);
        const buffer = file ? await loadBuffer(b.ctx, file) : null;
        if (buffer) clips[id] = buffer;
      }));
      return { kind: 'recipe', recipe: entry.recipe, clips };
    }
  }
}

function prepare(b: Bus, cue: Cue): Promise<Sound> {
  let sound = sounds.get(cue);
  if (!sound) {
    sound = load(b, cue);
    sounds.set(cue, sound);
  }
  return sound;
}

/** Plays a prepared sound into out at t; returns when it ends. */
function render(b: Bus, out: AudioNode, sound: Sound, t: number): number {
  switch (sound.kind) {
    case 'silent':
      return t;
    case 'clip':
      return playClip(b.ctx, out, sound.buffer, sound.adjust, t);
    case 'recipe':
      return playRecipe(b.ctx, out, sound.recipe, t, sound.clips);
  }
}

/** A cue's own gain into the bus: volume on a curve that feels even across the slider. */
function level(volume: number) {
  return volume * volume * 0.9;
}

/** Starts a cue `delay` seconds from now at `gain`; its voice can cut it short. */
function startCue(cue: Cue, gain: number, delay = 0): Voice | null {
  const b = audio();
  if (!b || gain <= 0) return null;
  const out = b.ctx.createGain();
  out.gain.value = gain;
  out.connect(b.input);
  const asked = performance.now();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    out.disconnect();
  };
  void prepare(b, cue).then((sound) => {
    const waited = performance.now() - asked;
    if (done || waited > LATE_MS) return finish();
    const t = b.ctx.currentTime + 0.01 + Math.max(0, delay - waited / 1000);
    let end = t;
    // a recipe with numbers the Web Audio API refuses plays nothing rather than breaking the game
    try {
      end = render(b, out, sound, t);
    } catch {
      return finish();
    }
    setTimeout(finish, (end - b.ctx.currentTime + TAIL_SECS) * 1000);
  });
  return {
    stop() {
      if (done) return;
      // a quick fade rather than a click
      out.gain.setTargetAtTime(0, b.ctx.currentTime, 0.015);
      setTimeout(finish, 80);
    },
  };
}

const gate = new CueGate({
  same: { max: 2, windowMs: 80 },
  // six lands tapped for one spell: one tap, a little louder
  bursts: { tap: 120, shuffle: 150 },
  // the log says "countered" around when the board shows the spell leave the stack
  replaces: { counter: ['resolve'] },
  replaceWindowMs: 400,
});

let warmed = false;

/** Loads the manifest and the frequent cues' samples, so the first of each plays in time. */
function warm() {
  if (warmed) return;
  const b = audio();
  if (!b) return;
  warmed = true;
  for (const cue of FREQUENT) void prepare(b, cue);
}

// the audio context needs a user gesture before it runs: load ahead on the first one
if (typeof window !== 'undefined') {
  const onGesture = () => {
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
    if (useSettings.getState().settings.sound) warm();
  };
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
}

/** Plays a cue if the player's sound settings allow it, `delay` seconds from now. */
export function playCue(cue: Cue, delay = 0) {
  const settings = useSettings.getState().settings;
  if (!cueAllowed(cue, settings)) return;
  warm();
  gate.play(cue, (boost) => startCue(cue, level(useSettings.getState().settings.volume) * boost, delay));
}

/** Plays a cue regardless of the on/off settings (the volume preview in Settings). */
export function previewCue(cue: Cue, volume = useSettings.getState().settings.volume) {
  if (volume <= 0) return;
  startCue(cue, level(volume));
}
