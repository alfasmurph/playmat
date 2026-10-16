/**
 * Commander brackets (Wizards' 1 to 5: Exhibition, Core, Upgraded, Optimized, cEDH), estimated from a deck's cards the
 * way deck sites do: by its Game Changers, mass land denial, extra turns and two-card infinite combos. Brackets 1 and 5
 * are about how a table means to play, which no list shows, so an estimate is 2, 3 or 4; the player can set any of
 * them on their own deck. Whether a combo comes together early (4) or late (3) isn't something a list shows: it counts
 * as Upgraded.
 */

export type Bracket = 1 | 2 | 3 | 4 | 5;

export const BRACKETS: readonly Bracket[] = [1, 2, 3, 4, 5];

/** The card lists brackets are judged by (public/data/brackets.json, from scripts/build-brackets.mjs). */
export interface BracketLists {
  updated?: string;
  gameChangers: string[];
  massLandDenial: string[];
  extraTurns: string[];
  /** two-card infinite combos, each pair of names */
  combos?: [string, string][];
}

export interface BracketEstimate {
  bracket: Bracket;
  /** the deck's cards on each list, by name */
  gameChangers: string[];
  massLandDenial: string[];
  extraTurns: string[];
  /** the combos the deck holds both halves of, "A + B" */
  combos: string[];
}

/** a card's name for matching: lower case; a double-faced card matches by either face or both */
function keys(name: string): string[] {
  const whole = name.trim().toLowerCase();
  return [whole, ...whole.split(' // ')];
}

function lookup(names: readonly string[]): Map<string, string> {
  const byKey = new Map<string, string>();
  for (const name of names) for (const key of keys(name)) byKey.set(key, name);
  return byKey;
}

const lookups = new WeakMap<BracketLists, { gameChangers: Map<string, string>; massLandDenial: Map<string, string>; extraTurns: Map<string, string> }>();

/**
 * The bracket a deck's cards put it in: any mass land denial, four or more Game Changers or three or more extra turns
 * make it Optimized (4); one to three Game Changers, two extra turns or a two-card combo, Upgraded (3); otherwise
 * Core (2).
 */
export function estimateBracket(cardNames: Iterable<string>, lists: BracketLists): BracketEstimate {
  let known = lookups.get(lists);
  if (!known) {
    known = { gameChangers: lookup(lists.gameChangers), massLandDenial: lookup(lists.massLandDenial), extraTurns: lookup(lists.extraTurns) };
    lookups.set(lists, known);
  }
  const names = [...cardNames];
  const found = { gameChangers: new Set<string>(), massLandDenial: new Set<string>(), extraTurns: new Set<string>() };
  for (const name of names) {
    for (const list of ['gameChangers', 'massLandDenial', 'extraTurns'] as const) {
      const hit = keys(name).map((key) => known[list].get(key)).find(Boolean);
      if (hit) found[list].add(hit);
    }
  }
  const held = new Set<string>();
  for (const name of names) for (const key of keys(name)) held.add(key);
  const holds = (name: string) => keys(name).some((key) => held.has(key));
  const combos = (lists.combos ?? [])
    .filter(([a, b]) => holds(a) && holds(b))
    .map(([a, b]) => `${a} + ${b}`)
    .sort();
  const gameChangers = [...found.gameChangers].sort();
  const massLandDenial = [...found.massLandDenial].sort();
  const extraTurns = [...found.extraTurns].sort();
  const bracket: Bracket = massLandDenial.length > 0 || gameChangers.length >= 4 || extraTurns.length >= 3
    ? 4
    : gameChangers.length > 0 || extraTurns.length >= 2 || combos.length > 0 ? 3 : 2;
  return { bracket, gameChangers, massLandDenial, extraTurns, combos };
}

/** What an estimate rests on, for a tooltip: "2 Game Changers: Cyclonic Rift, Rhystic Study". Empty for a plain deck. */
export function bracketReasons(estimate: BracketEstimate): string[] {
  const line = (count: number, one: string, many: string, names: string[]) => (count ? [`${count} ${count === 1 ? one : many}: ${names.join(', ')}`] : []);
  return [
    ...line(estimate.gameChangers.length, 'Game Changer', 'Game Changers', estimate.gameChangers),
    ...line(estimate.massLandDenial.length, 'mass land denial card', 'mass land denial cards', estimate.massLandDenial),
    ...line(estimate.extraTurns.length, 'extra turn card', 'extra turn cards', estimate.extraTurns),
    ...line(estimate.combos.length, 'two-card combo', 'two-card combos', estimate.combos),
  ];
}

/** The counts behind an estimate, short: "20 Game Changers, 2 extra turns". Empty for a plain deck. */
export function bracketSummary(estimate: BracketEstimate): string {
  const part = (count: number, one: string, many: string) => (count ? [`${count} ${count === 1 ? one : many}`] : []);
  return [
    ...part(estimate.gameChangers.length, 'Game Changer', 'Game Changers'),
    ...part(estimate.massLandDenial.length, 'mass land denial', 'mass land denial'),
    ...part(estimate.extraTurns.length, 'extra turn', 'extra turns'),
    ...part(estimate.combos.length, 'two-card combo', 'two-card combos'),
  ].join(', ');
}

export const BRACKET_NAMES: Record<Bracket, string> = { 1: 'Exhibition', 2: 'Core', 3: 'Upgraded', 4: 'Optimized', 5: 'cEDH' };
