// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from '../../test/fakeAudio';

/** the files public/sounds would serve, by path; anything else is a 404 */
let served: Record<string, unknown> = {};
/** the audio contexts the engine made (it makes one) */
let made: FakeAudioContext[] = [];

class TestAudioContext extends FakeAudioContext {
  constructor() {
    super();
    made.push(this);
  }
}

async function engine() {
  vi.resetModules();
  return import('./sound');
}

const started = () => made.flatMap((ctx) => ctx.sources());
const sources = (kind: string) => started().filter((node) => node.kind === kind);

beforeEach(() => {
  served = {};
  made = [];
  vi.stubGlobal('AudioContext', TestAudioContext);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const file = served[String(url)];
    if (file === undefined) return new Response(null, { status: 404 });
    return typeof file === 'string' ? new Response(file) : new Response(JSON.stringify(file));
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('game cues', () => {
  it('plays the synthesized sound when there is no manifest, and nothing for a cue without one', async () => {
    const { playCue } = await engine();
    playCue('shuffle');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started()).toHaveLength(0);
    playCue('turn');
    await vi.waitFor(() => expect(sources('oscillator').length).toBeGreaterThan(0));
    expect(sources('bufferSource')).toHaveLength(0);
  });

  it('plays the manifest clip through its adjustments', async () => {
    served = {
      '/sounds/manifest.json': { version: 1, cues: { turn: { kind: 'clip', file: 'turn.mp3', adjust: { rate: 1.5 } } }, credits: [] },
      '/sounds/turn.mp3': 'mp3 bytes',
    };
    const { playCue } = await engine();
    playCue('turn');
    await vi.waitFor(() => expect(sources('bufferSource')).toHaveLength(1));
    expect(sources('bufferSource')[0].param('playbackRate').value).toBe(1.5);
    expect(sources('oscillator')).toHaveLength(0);
  });

  it('keeps silent cues silent and falls back when a clip is missing', async () => {
    served = {
      '/sounds/manifest.json': { version: 1, cues: { land: { kind: 'silent' }, turn: { kind: 'clip', file: 'turn.mp3' } } },
    };
    const { playCue } = await engine();
    playCue('land');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started()).toHaveLength(0);
    playCue('turn');
    await vi.waitFor(() => expect(sources('oscillator').length).toBeGreaterThan(0));
  });

  it('plays a recipe, skipping a clip layer whose sample is not there', async () => {
    served = {
      '/sounds/manifest.json': {
        version: 1,
        cues: { counter: { kind: 'recipe', recipe: { layers: [{ kind: 'tone', f0: 600, f1: 120 }, { kind: 'clip', clipFile: 'counter-k1' }, { kind: 'clip', clipFile: 'tap-k2' }] } } },
      },
      '/sounds/clips/tap-k2.mp3': 'mp3 bytes',
    };
    const { playCue } = await engine();
    playCue('counter');
    await vi.waitFor(() => expect(sources('oscillator')).toHaveLength(1));
    expect(sources('bufferSource')).toHaveLength(1);
  });

  it('follows the sound switch, though the Settings preview plays anyway', async () => {
    const { playCue, previewCue } = await engine();
    const { useSettings } = await import('../stores/settings');
    useSettings.getState().update({ sound: false });
    playCue('turn');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started()).toHaveLength(0);
    previewCue('turn', 0.5);
    await vi.waitFor(() => expect(sources('oscillator').length).toBeGreaterThan(0));
    useSettings.getState().update({ sound: true });
  });
});
