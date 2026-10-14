import { describe, expect, it } from 'vitest';
import { FakeAudioContext, FakeBuffer } from '../../test/fakeAudio';
import { ADJUST0, parseManifest, playClip, recipeClipFile } from './manifest';
import { newLayer } from './recipe';

describe('parseManifest', () => {
  it('reads clips, recipes and silence, filling in adjustments', () => {
    const manifest = parseManifest({
      version: 1,
      cues: {
        turn: { kind: 'clip', file: 'turn.mp3', adjust: { vol: 0.5, rate: 1.2 } },
        cast: { kind: 'recipe', recipe: { gain: 0.7, layers: [{ kind: 'noise' }] } },
        tap: { kind: 'silent' },
      },
      credits: [{ cue: 'turn', credit: '"Gong" by Someone (Freesound #1, CC0)', url: 'https://freesound.org/s/1/' }],
    });
    expect(manifest?.cues.turn).toEqual({ kind: 'clip', file: 'turn.mp3', adjust: { ...ADJUST0, vol: 0.5, rate: 1.2 } });
    expect(manifest?.cues.cast).toMatchObject({ kind: 'recipe', recipe: { gain: 0.7, layers: [newLayer('noise')] } });
    expect(manifest?.cues.tap).toEqual({ kind: 'silent' });
    expect(manifest?.credits).toHaveLength(1);
  });

  it('is null for anything that is not a version 1 manifest', () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest('<!doctype html>')).toBeNull();
    expect(parseManifest({ version: 2, cues: {} })).toBeNull();
    expect(parseManifest({ version: 1 })).toBeNull();
  });

  it('leaves out entries it cannot play, so those cues fall back', () => {
    const manifest = parseManifest({
      version: 1,
      cues: {
        a: { kind: 'clip', file: '../secrets.mp3' },
        b: { kind: 'clip', file: 'sub/b.mp3' },
        c: { kind: 'clip' },
        d: { kind: 'loud' },
        e: { kind: 'recipe' },
        f: 'turn.mp3',
      },
    });
    expect(manifest?.cues).toEqual({});
    expect(manifest?.credits).toEqual([]);
  });

  it('keeps adjustments in range', () => {
    const manifest = parseManifest({ version: 1, cues: { a: { kind: 'clip', file: 'a.mp3', adjust: { vol: -1, rate: 0, trimStart: 'x', length: Infinity } } } });
    expect(manifest?.cues.a).toEqual({ kind: 'clip', file: 'a.mp3', adjust: { vol: 0, rate: 0.05, trimStart: 0, length: 0, fadeOut: 0.04 } });
  });
});

describe('recipeClipFile', () => {
  it('finds a recipe clip under clips/, by picker option id', () => {
    expect(recipeClipFile('tap-k1')).toBe('clips/tap-k1.mp3');
    expect(recipeClipFile('../x')).toBeNull();
    expect(recipeClipFile('')).toBeNull();
  });
});

describe('playClip', () => {
  it('plays the trimmed part at its rate, fading out at the end', () => {
    const ctx = new FakeAudioContext();
    const buffer = new FakeBuffer(1, 8000 * 3, 8000);
    // 3 s of source, skip 0.5, play 1 s of it at double speed: half a second
    const end = playClip(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, buffer as unknown as AudioBuffer, { vol: 0.8, rate: 2, trimStart: 0.5, length: 1, fadeOut: 0.1 }, 2);
    expect(end).toBeCloseTo(2.5);
    const [source] = ctx.sources();
    expect(source.started?.[0]).toBe(2);
    expect(source.started?.[1]).toBe(0.5);
    expect(source.started?.[2]).toBeCloseTo(1.01);
    expect(source.param('playbackRate').value).toBe(2);
    const gain = ctx.of('gain')[0].param('gain').events;
    expect(gain[0]).toEqual(['set', 0.8, 2]);
    expect(gain[1][2]).toBeCloseTo(2.4);
    expect(gain[2][0]).toBe('linear');
    expect(gain[2][2]).toBeCloseTo(2.5);
  });

  it('plays to the end when the length is 0', () => {
    const ctx = new FakeAudioContext();
    const buffer = new FakeBuffer(1, 8000 * 2, 8000);
    expect(playClip(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, buffer as unknown as AudioBuffer, ADJUST0, 0)).toBeCloseTo(2);
  });
});
