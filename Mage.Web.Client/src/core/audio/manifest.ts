import { normaliseRecipe, type Recipe } from './recipe';

/**
 * The sound manifest (public/sounds/manifest.json, written by scripts/sounds-from-picks.mjs from the owner's picks):
 * what each game cue plays. A cue is a recorded clip with its adjustments, a made sound (a recipe), or silence; a
 * cue the manifest leaves out keeps the client's own synthesized sound.
 */

/** How a clip plays: gain, speed (which changes pitch), where it starts, how long it plays and its fade-out. */
export interface ClipAdjust {
  vol: number;
  rate: number;
  /** seconds of the source skipped at the start */
  trimStart: number;
  /** seconds of the source played (before the rate), 0 for all of it */
  length: number;
  /** a linear fade at the end, in seconds */
  fadeOut: number;
}

export const ADJUST0: Readonly<ClipAdjust> = { vol: 1, rate: 1, trimStart: 0, length: 0, fadeOut: 0.04 };

export type CueSound =
  | { kind: 'clip'; file: string; adjust: ClipAdjust }
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'silent' };

export interface SoundCredit {
  cue: string;
  credit: string;
  url: string;
}

export interface SoundManifest {
  version: 1;
  cues: Record<string, CueSound>;
  credits: SoundCredit[];
}

/** File names stay inside the sounds folder. */
const SAFE_FILE = /^[\w-][\w.-]*$/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function parseAdjust(value: unknown): ClipAdjust {
  const a = isObject(value) ? value : {};
  return {
    vol: Math.max(0, finite(a.vol, ADJUST0.vol)),
    rate: Math.min(4, Math.max(0.05, finite(a.rate, ADJUST0.rate))),
    trimStart: Math.max(0, finite(a.trimStart, ADJUST0.trimStart)),
    length: Math.max(0, finite(a.length, ADJUST0.length)),
    fadeOut: Math.max(0, finite(a.fadeOut, ADJUST0.fadeOut)),
  };
}

function parseCue(value: unknown): CueSound | null {
  if (!isObject(value)) return null;
  switch (value.kind) {
    case 'clip':
      return typeof value.file === 'string' && SAFE_FILE.test(value.file) ? { kind: 'clip', file: value.file, adjust: parseAdjust(value.adjust) } : null;
    case 'recipe':
      return isObject(value.recipe) ? { kind: 'recipe', recipe: normaliseRecipe(value.recipe) } : null;
    case 'silent':
      return { kind: 'silent' };
    default:
      return null;
  }
}

/** The manifest from its JSON, or null when it isn't one; entries it can't read are left out (so they fall back). */
export function parseManifest(data: unknown): SoundManifest | null {
  if (!isObject(data) || data.version !== 1 || !isObject(data.cues)) return null;
  const cues: Record<string, CueSound> = {};
  for (const [cue, value] of Object.entries(data.cues)) {
    const sound = parseCue(value);
    if (sound) cues[cue] = sound;
  }
  const credits = Array.isArray(data.credits)
    ? data.credits.filter(isObject).map((c) => ({ cue: String(c.cue ?? ''), credit: String(c.credit ?? ''), url: String(c.url ?? '') }))
    : [];
  return { version: 1, cues, credits };
}

/** Where a recipe's clip layer finds its sample, by picker option id; null for an id that isn't a plain name. */
export function recipeClipFile(optionId: string): string | null {
  return SAFE_FILE.test(optionId) ? `clips/${optionId}.mp3` : null;
}

/**
 * Plays a clip through its adjustments into dest at `when` (the picker's playClip, which the owner tuned by ear).
 * Returns the end time.
 */
export function playClip(ctx: BaseAudioContext, dest: AudioNode, buf: AudioBuffer, adj: ClipAdjust, when: number): number {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = adj.rate;
  const g = ctx.createGain();
  src.connect(g);
  g.connect(dest);
  const avail = Math.max(0.01, buf.duration - adj.trimStart);
  const len = Math.min(avail, adj.length > 0 ? adj.length : avail) / adj.rate;
  const fade = Math.min(adj.fadeOut, len * 0.9);
  g.gain.setValueAtTime(adj.vol, when);
  g.gain.setValueAtTime(adj.vol, when + len - fade);
  g.gain.linearRampToValueAtTime(0.0001, when + len);
  src.start(when, adj.trimStart, len * adj.rate + 0.01);
  return when + len;
}
