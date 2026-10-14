import { describe, expect, it } from 'vitest';
import { CueGate, type GateClock, type GateRules } from './cueGate';

const RULES: GateRules = {
  same: { max: 2, windowMs: 80 },
  bursts: { tap: 120 },
  replaces: { counter: ['resolve'] },
  replaceWindowMs: 400,
};

/** a clock the test moves by hand */
function testClock() {
  let time = 0;
  let timers: { at: number; run: () => void }[] = [];
  const clock: GateClock = {
    now: () => time,
    setTimeout: (run, ms) => timers.push({ at: time + ms, run }),
  };
  const advance = (ms: number) => {
    time += ms;
    const due = timers.filter((timer) => timer.at <= time);
    timers = timers.filter((timer) => timer.at > time);
    due.forEach((timer) => timer.run());
  };
  return { clock, advance };
}

function setup() {
  const { clock, advance } = testClock();
  const gate = new CueGate(RULES, clock);
  const played: { cue: string; boost: number; stopped: boolean }[] = [];
  const play = (cue: string) => gate.play(cue, (boost) => {
    const voice = { cue, boost, stopped: false };
    played.push(voice);
    return { stop: () => { voice.stopped = true; } };
  });
  return { play, played, advance };
}

describe('CueGate', () => {
  it('lets at most two of one cue start close together', () => {
    const { play, played, advance } = setup();
    play('draw');
    play('draw');
    play('draw');
    expect(played).toHaveLength(2);
    advance(81);
    play('draw');
    expect(played).toHaveLength(3);
    play('cast');
    expect(played.map((voice) => voice.cue)).toEqual(['draw', 'draw', 'draw', 'cast']);
  });

  it('gathers a burst of taps into one, a little louder', () => {
    const { play, played, advance } = setup();
    for (let i = 0; i < 6; i++) play('tap');
    expect(played).toHaveLength(0);
    advance(120);
    expect(played).toHaveLength(1);
    expect(played[0].boost).toBeCloseTo(1.5);
    play('tap');
    advance(120);
    expect(played[1].boost).toBe(1);
  });

  it('lets a counter cut the resolve short, or keep it from starting', () => {
    const { play, played, advance } = setup();
    play('resolve');
    advance(100);
    play('counter');
    expect(played.map((voice) => [voice.cue, voice.stopped])).toEqual([['resolve', true], ['counter', false]]);
    advance(1000);
    play('counter');
    advance(50);
    play('resolve');
    expect(played.map((voice) => voice.cue)).toEqual(['resolve', 'counter', 'counter']);
    advance(1000);
    play('resolve');
    expect(played).toHaveLength(4);
  });
});
