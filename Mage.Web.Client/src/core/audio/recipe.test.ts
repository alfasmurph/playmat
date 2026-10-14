import { describe, expect, it } from 'vitest';
import { FakeAudioContext, FakeBuffer, type FakeNode } from '../../test/fakeAudio';
import { driveCurve, newLayer, newRecipe, noiseBuffer, normaliseRecipe, playRecipe, recipeClipIds, recipeLength } from './recipe';

const play = (ctx: FakeAudioContext, ...args: [Parameters<typeof playRecipe>[2], number?, Record<string, FakeBuffer>?]) =>
  playRecipe(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, args[0], args[1], args[2] as unknown as Record<string, AudioBuffer>);

/** where a node's sound ends up, following its first connection */
function path(node: FakeNode): string[] {
  const out: string[] = [];
  let at: FakeNode | undefined = node;
  while (at) {
    out.push(at.kind);
    at = at.outputs.find((next): next is FakeNode => 'kind' in next) as FakeNode | undefined;
    if (out.length > 12) break;
  }
  return out;
}

describe('normaliseRecipe', () => {
  it('fills in every field and keeps what is given', () => {
    const r = normaliseRecipe({ gain: 0.5, layers: [{ kind: 'noise', vol: 0.3 }] });
    expect(r.gain).toBe(0.5);
    expect(r.echoFeedback).toBe(0.3);
    expect(r.layers).toEqual([{ ...newLayer('noise'), vol: 0.3 }]);
  });

  it('starts from the default recipe and keeps at most four layers', () => {
    expect(normaliseRecipe(null)).toEqual(newRecipe());
    expect(normaliseRecipe({}).layers).toEqual([newLayer('tone')]);
    const many = normaliseRecipe({ layers: Array.from({ length: 6 }, (_, i) => ({ f0: 100 + i })) });
    expect(many.layers.map((l) => l.f0)).toEqual([100, 101, 102, 103]);
  });
});

describe('recipeLength', () => {
  it('ends with the last playing layer, repeats included', () => {
    const layer = { ...newLayer(), start: 0.1, attack: 0.01, hold: 0.04, release: 0.2, reps: 3, gap: 0.1 };
    // 0.1 + 2 * 0.1 + 0.25
    expect(recipeLength({ layers: [layer] })).toBeCloseTo(0.55);
    expect(recipeLength({ layers: [layer, { ...newLayer(), on: false, start: 5 }] })).toBeCloseTo(0.55);
  });

  it('adds the echo tail, longer for more feedback and at most eight echoes', () => {
    const layers = [{ attack: 0, hold: 0, release: 0.5 }];
    expect(recipeLength({ layers, echoMix: 0.3, echoTime: 0 })).toBeCloseTo(0.5);
    const short = recipeLength({ layers, echoMix: 0.3, echoTime: 0.2, echoFeedback: 0.1 });
    // 1 + log(0.01) / log(0.1) = 3 echoes
    expect(short).toBeCloseTo(0.5 + 0.2 * 3);
    expect(recipeLength({ layers, echoMix: 0.3, echoTime: 0.2, echoFeedback: 0.9 })).toBeCloseTo(0.5 + 0.2 * 8);
  });
});

describe('recipeClipIds', () => {
  it('lists the clips that playing layers use, once each', () => {
    const layers = [{ kind: 'clip' as const, clipFile: 'tap-k1' }, { kind: 'clip' as const, clipFile: 'tap-k1' }, { kind: 'clip' as const, clipFile: 'x', on: false }, { kind: 'tone' as const }];
    expect(recipeClipIds({ layers })).toEqual(['tap-k1']);
  });
});

describe('noiseBuffer and driveCurve', () => {
  it('makes the same noise every time, cached per context', () => {
    const a = new FakeAudioContext();
    const b = new FakeAudioContext();
    const noise = noiseBuffer(a as unknown as AudioContext);
    expect(noiseBuffer(a as unknown as AudioContext)).toBe(noise);
    expect(noise.length).toBe(a.sampleRate * 2);
    expect(Array.from(noiseBuffer(b as unknown as AudioContext).getChannelData(0).slice(0, 8))).toEqual(Array.from(noise.getChannelData(0).slice(0, 8)));
    expect(Math.max(...noise.getChannelData(0))).toBeLessThanOrEqual(1);
  });

  it('clips softly and symmetrically', () => {
    const curve = driveCurve(0.5);
    expect(driveCurve(0.5)).toBe(curve);
    expect(curve[0]).toBeCloseTo(-1);
    expect(curve[1023]).toBeCloseTo(1);
    expect(curve[300]).toBeCloseTo(-curve[723]);
  });
});

describe('playRecipe', () => {
  it('plays each repeat of a tone through its envelope into the recipe bus, and returns the end', () => {
    const ctx = new FakeAudioContext();
    const end = play(ctx, { gain: 0.6, layers: [{ wave: 'triangle', f0: 200, f1: 100, attack: 0.01, hold: 0.02, release: 0.1, reps: 2, gap: 0.3, step: 12 }] }, 1);
    expect(end).toBeCloseTo(1 + 0.3 + 0.13);
    const tones = ctx.sources();
    expect(tones.map((t) => t.started?.[0])).toEqual([1, 1.3]);
    expect(tones.map((t) => t.type)).toEqual(['triangle', 'triangle']);
    // the second repeat an octave up
    expect(tones[1].param('frequency').events[0]).toEqual(['set', 400, 1.3]);
    expect(tones[1].param('frequency').events[1]).toEqual(['exponential', 200, 1.3 + 0.13]);
    expect(path(tones[0])).toEqual(['oscillator', 'gain', 'gain', 'destination']);
    const bus = ctx.of('gain')[0];
    expect(bus.param('gain').value).toBe(0.6);
  });

  it('adds noise, drive, filter, vibrato, tremolo and echo when asked', () => {
    const ctx = new FakeAudioContext();
    play(ctx, {
      echoTime: 0.2, echoMix: 0.3, echoFeedback: 0.95,
      layers: [{ kind: 'noise', drive: 0.4, filter: 'bandpass', c0: 1000, c1: 3000, vibRate: 5, vibDepth: 10, wobRate: 4, wobDepth: 0.5 }],
    }, 0);
    const noise = ctx.sources().find((node) => node.kind === 'bufferSource')!;
    expect(noise.loop).toBe(true);
    expect(path(noise)).toEqual(['bufferSource', 'waveshaper', 'biquad', 'gain', 'gain', 'gain', 'destination']);
    // vibrato and tremolo each run an LFO
    expect(ctx.sources().filter((node) => node.kind === 'oscillator')).toHaveLength(2);
    const delay = ctx.of('delay')[0];
    expect(delay.param('delayTime').value).toBe(0.2);
    // feedback is held below 0.9
    expect(ctx.of('gain').some((node) => node.param('gain').value === 0.9)).toBe(true);
  });

  it('plays a clip layer from its buffer and skips one whose clip is missing', () => {
    const ctx = new FakeAudioContext();
    const buffer = new FakeBuffer(1, 8000, 8000);
    play(ctx, { layers: [{ kind: 'clip', clipFile: 'tap-k1', rate: 2 }, { kind: 'clip', clipFile: 'gone' }] }, 0, { 'tap-k1': buffer });
    const sources = ctx.sources();
    expect(sources).toHaveLength(1);
    expect(sources[0].buffer).toBe(buffer);
    expect(sources[0].param('playbackRate').value).toBe(2);
  });

  it('plays nothing for layers that are off', () => {
    const ctx = new FakeAudioContext();
    expect(play(ctx, { layers: [{ on: false }] }, 2)).toBe(2);
    expect(ctx.sources()).toHaveLength(0);
  });
});
