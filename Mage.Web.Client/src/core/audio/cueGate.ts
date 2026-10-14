/**
 * Keeps a burst of cues from turning into noise: a cap on copies of one cue at once, bursts of one cue (six lands
 * tapped for a big spell) collapsed into a single, slightly louder sound, and cues that replace another (a counter
 * over the resolve it stops) winning whichever arrives first. Pure apart from the clock and timer it is given.
 */

export interface Voice {
  stop(): void;
}

export interface GateRules {
  /** at most `max` copies of one cue start within `windowMs` */
  same: { max: number; windowMs: number };
  /** cues gathered for this long into one, by cue */
  bursts: Readonly<Record<string, number>>;
  /** cue -> the cues it replaces when the two land within `replaceWindowMs` */
  replaces: Readonly<Record<string, readonly string[]>>;
  replaceWindowMs: number;
}

export interface GateClock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
}

const realClock: GateClock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeout: (run, ms) => setTimeout(run, ms),
};

/** each extra cue in a burst adds this much gain, up to BURST_MAX_BOOST */
const BURST_STEP = 0.12;
const BURST_MAX_BOOST = 1.5;

export class CueGate {
  private recent: { cue: string; at: number; voice: Voice | null }[] = [];
  private bursts = new Map<string, number>();

  constructor(private readonly rules: GateRules, private readonly clock: GateClock = realClock) {}

  /**
   * Asks for a cue. `start` plays it at the given gain boost (1 is as recorded) and returns its voice, or null when
   * nothing played; the gate calls it now, later (the end of a burst) or not at all.
   */
  play(cue: string, start: (boost: number) => Voice | null): void {
    const burstMs = this.rules.bursts[cue];
    if (!burstMs) {
      this.admit(cue, 1, start);
      return;
    }
    const count = this.bursts.get(cue);
    if (count !== undefined) {
      this.bursts.set(cue, count + 1);
      return;
    }
    this.bursts.set(cue, 1);
    this.clock.setTimeout(() => {
      const total = this.bursts.get(cue) ?? 1;
      this.bursts.delete(cue);
      this.admit(cue, Math.min(BURST_MAX_BOOST, 1 + (total - 1) * BURST_STEP), start);
    }, burstMs);
  }

  private admit(cue: string, boost: number, start: (boost: number) => Voice | null): void {
    const now = this.clock.now();
    const { same, replaces, replaceWindowMs } = this.rules;
    this.recent = this.recent.filter((entry) => now - entry.at <= Math.max(same.windowMs, replaceWindowMs));
    // something that replaces this cue just played: this one would only contradict it
    if (this.recent.some((entry) => now - entry.at <= replaceWindowMs && replaces[entry.cue]?.includes(cue))) return;
    if (this.recent.filter((entry) => entry.cue === cue && now - entry.at <= same.windowMs).length >= same.max) return;
    const voice = start(boost);
    // and what this cue replaces is cut short
    for (const entry of this.recent) {
      if (now - entry.at <= replaceWindowMs && replaces[cue]?.includes(entry.cue)) {
        entry.voice?.stop();
        entry.voice = null;
      }
    }
    this.recent.push({ cue, at: now, voice });
  }
}
