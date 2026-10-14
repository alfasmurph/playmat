import type { GameSessionState } from '../../core/game/gameSession';
import type { GameEventView } from '../../protocol/generated/views';

/**
 * Every game cue, as the sound picker names its events. What each plays comes from the sound manifest (sound.ts);
 * chosen here from what changed between two game states, or from a game log line.
 */
export type Cue =
  | 'turn' | 'decide' | 'cast' | 'resolve' | 'land' | 'draw' | 'shuffle' | 'tap' | 'untap' | 'attack' | 'attackBig'
  | 'block' | 'damage' | 'damageBig' | 'lifeGain' | 'creatureDies' | 'token' | 'exile' | 'counter' | 'discard'
  | 'mulligan' | 'timer' | 'victory' | 'defeat';

/** The cues that still play with "Only important cues": your turn, a decision, combat against you, the clock, the result. */
export const IMPORTANT_CUES: ReadonlySet<Cue> = new Set<Cue>(['turn', 'decide', 'timer', 'victory', 'defeat']);

/** Seconds left on your clock when the warning plays. */
export const TIMER_WARNING_SECS = 10;
/** Damage to one player or creature in one change that makes it a big hit. */
export const BIG_DAMAGE = 5;
/** Attackers, or their total power, that make it a big attack. */
export const BIG_ATTACK = { attackers: 3, power: 10 };

export interface CueSnapshot {
  turn: number;
  active: string | null;
  deciding: boolean;
  stack: number;
  hand: number;
  life: Map<string, number>;
  /** lands on your battlefield */
  myLands: number;
  attackers: number;
  /** total power of the attackers */
  attackPower: number;
  blockers: number;
  /** seconds left on your clock while you hold priority with the timer running; null otherwise */
  myClock: number | null;
  over: boolean;
  won: boolean;
  /** your permanents: tapped or not */
  mine: Map<string, boolean>;
  /** creatures on every battlefield, with their names */
  creatures: Map<string, string>;
  /** tokens on every battlefield */
  tokens: Set<string>;
  /** damage marked on permanents */
  damage: Map<string, number>;
  /** cards in every graveyard, with their names */
  graveyard: Map<string, string>;
  /** per player: cards in hand and in the graveyard */
  handCounts: Map<string, number>;
  graveCounts: Map<string, number>;
  /** cards in exile, every zone */
  exiled: number;
  /** what the server says happened since the last view (null when the view carries none) */
  events: readonly GameEventView[] | null;
}

export function cueSnapshot(state: GameSessionState, myId: string | null): CueSnapshot {
  const view = state.view;
  const players = view?.players ?? [];
  const me = players.find((player) => player.playerId === myId);
  const mine = new Map<string, boolean>();
  const creatures = new Map<string, string>();
  const tokens = new Set<string>();
  const damage = new Map<string, number>();
  const graveyard = new Map<string, string>();
  const exiled = new Set<string>();
  for (const player of players) {
    for (const [id, card] of Object.entries(player.battlefield ?? {})) {
      if (player === me) mine.set(id, !!card.tapped);
      if ((card.cardTypes ?? []).includes('CREATURE')) creatures.set(id, card.name ?? '');
      if (card.isToken) tokens.add(id);
      if (card.damage) damage.set(id, card.damage);
    }
    for (const [id, card] of Object.entries(player.graveyard ?? {})) graveyard.set(id, card.name ?? '');
    for (const id of Object.keys(player.exile ?? {})) exiled.add(id);
  }
  for (const zone of view?.exiles ?? []) for (const id of Object.keys(zone)) exiled.add(id);
  const combat = view?.combat ?? [];
  const attackers = combat.flatMap((group) => Object.values(group.attackers ?? {}));
  return {
    turn: view?.turn ?? 0,
    active: view?.activePlayerId ?? null,
    deciding: state.mode === 'play' && state.interaction.mode !== 'waiting' && !state.awaitingServer,
    stack: Object.keys(view?.stack ?? {}).length,
    hand: Object.keys(view?.myHand ?? {}).length,
    life: new Map(players.map((player) => [player.playerId ?? '', player.life ?? 0])),
    myLands: Object.values(me?.battlefield ?? {}).filter((card) => (card.cardTypes ?? []).includes('LAND')).length,
    attackers: attackers.length,
    attackPower: attackers.reduce((sum, card) => sum + Math.max(0, parseInt(card.power ?? '', 10) || 0), 0),
    blockers: combat.reduce((sum, group) => sum + Object.keys(group.blockers ?? {}).length, 0),
    myClock: me?.timerActive && me.hasPriority && (me.priorityTimeLeftSecs ?? 0) > 0 ? me.priorityTimeLeftSecs! : null,
    over: !!state.gameOver,
    won: !!state.endInfo?.won || /you won/i.test(state.gameOver ?? ''),
    mine,
    creatures,
    tokens,
    damage,
    graveyard,
    handCounts: new Map(players.map((player) => [player.playerId ?? '', player.handCount ?? 0])),
    graveCounts: new Map(players.map((player) => [player.playerId ?? '', Object.keys(player.graveyard ?? {}).length])),
    exiled: exiled.size,
    events: view?.events ?? null,
  };
}

/** The server's events for this change; null when it sent none (an older server, or a view repeated for a prompt). */
function freshEvents(before: CueSnapshot, now: CueSnapshot): readonly GameEventView[] | null {
  return now.events && now.events !== before.events && now.events.length > 0 ? now.events : null;
}

/** The most damage one player or creature took in this change, and whether any creature took some. */
function hits(before: CueSnapshot, now: CueSnapshot, events: readonly GameEventView[] | null) {
  let most = 0;
  let creature = false;
  for (const [id, life] of now.life) most = Math.max(most, (before.life.get(id) ?? life) - life);
  for (const [id, marked] of now.damage) {
    const added = marked - (before.damage.get(id) ?? 0);
    if (added > 0 && before.creatures.has(id)) creature = true;
    most = Math.max(most, added);
  }
  const dealt = new Map<string, number>();
  for (const event of events ?? []) {
    if (event.kind !== 'DAMAGE' || !event.targetId || !event.amount) continue;
    dealt.set(event.targetId, (dealt.get(event.targetId) ?? 0) + event.amount);
    if (!now.life.has(event.targetId)) creature = true;
  }
  for (const amount of dealt.values()) most = Math.max(most, amount);
  return { most, creature };
}

function creatureDied(before: CueSnapshot, now: CueSnapshot, events: readonly GameEventView[] | null): boolean {
  if (events) {
    // a face-down creature's move comes without its id
    return events.some((event) => event.kind === 'ZONE' && event.fromZone === 'BATTLEFIELD' && event.toZone === 'GRAVEYARD'
      && (!event.targetId || before.creatures.has(event.targetId)));
  }
  // without the server's events: a creature left and its card (same id, or same name) is new in a graveyard
  const arrived = new Set<string>();
  for (const [id, name] of now.graveyard) {
    if (before.graveyard.has(id)) continue;
    arrived.add(id);
    arrived.add(`name:${name}`);
  }
  return [...before.creatures].some(([id, name]) => !now.creatures.has(id) && (arrived.has(id) || (!!name && arrived.has(`name:${name}`))));
}

function discarded(before: CueSnapshot, now: CueSnapshot, events: readonly GameEventView[] | null): boolean {
  if (events) return events.some((event) => event.kind === 'ZONE' && event.fromZone === 'HAND' && event.toZone === 'GRAVEYARD');
  // without them: a hand shrank while its owner's graveyard grew, with no spell going on the stack or off it
  if (now.stack !== before.stack) return false;
  return [...now.handCounts].some(([id, hand]) => hand < (before.handCounts.get(id) ?? hand)
    && (now.graveCounts.get(id) ?? 0) > (before.graveCounts.get(id) ?? 0));
}

/** Everything worth a sound in one change, before choosing (the result and the first view aside). */
export function cuesIn(before: CueSnapshot, now: CueSnapshot, myId: string | null, autoPassing: boolean): Set<Cue> {
  const heard = new Set<Cue>();
  const events = freshEvents(before, now);
  if (now.turn !== before.turn && now.active && now.active === myId) heard.add('turn');
  if (now.myClock !== null && now.myClock <= TIMER_WARNING_SECS && (before.myClock === null || before.myClock > TIMER_WARNING_SECS)) heard.add('timer');
  if (now.attackers > 0 && before.attackers === 0) {
    heard.add(now.attackers >= BIG_ATTACK.attackers || now.attackPower >= BIG_ATTACK.power ? 'attackBig' : 'attack');
  }
  if (now.blockers > before.blockers) heard.add('block');
  if (now.stack > before.stack) heard.add('cast');
  const hit = hits(before, now, events);
  if (hit.most >= BIG_DAMAGE) heard.add('damageBig');
  else if (hit.most > 0 || hit.creature) heard.add('damage');
  if (creatureDied(before, now, events)) heard.add('creatureDies');
  if ([...now.life].some(([id, life]) => life > (before.life.get(id) ?? life))) heard.add('lifeGain');
  if (now.stack < before.stack) heard.add('resolve');
  if ([...now.tokens].some((id) => !before.tokens.has(id))) heard.add('token');
  if (now.exiled > before.exiled) heard.add('exile');
  if (now.myLands > before.myLands && now.turn === before.turn) heard.add('land');
  if (discarded(before, now, events)) heard.add('discard');
  if (now.hand > before.hand && now.turn === before.turn) heard.add('draw');
  // a prompt the client answers by itself isn't a decision worth a chime
  if (now.deciding && !before.deciding && !autoPassing) heard.add('decide');
  let untapped = 0;
  let tapped = false;
  for (const [id, isTapped] of now.mine) {
    const was = before.mine.get(id);
    if (was === true && !isTapped) untapped++;
    // (a permanent that enters tapped isn't tapped by anyone)
    if (was === false && isTapped) tapped = true;
  }
  // your untap step: several of your permanents at once
  if (untapped >= 2 && now.active === myId) heard.add('untap');
  if (tapped) heard.add('tap');
  return heard;
}

/** Most important first: one change plays the first of these it has. */
const PRIORITY: readonly Cue[] = [
  'turn', 'timer', 'attackBig', 'attack', 'block', 'cast', 'damageBig', 'damage', 'lifeGain', 'resolve', 'creatureDies',
  'token', 'exile', 'land', 'discard', 'draw', 'decide', 'untap', 'tap',
];
/** What a change may add after its lead cue: what came of it (a creature dying of the damage, a token from a spell). */
const COMPANIONS: readonly Cue[] = ['untap', 'creatureDies', 'token', 'exile', 'discard'];

/**
 * The cues worth hearing for a change of state, in the order to play them: the most important one, and at most one
 * companion that tells what came of it (a creature dying to the damage, the tokens a spell made; your permanents
 * untapping just before your turn's chime). Never more, so a busy update (a spell resolving into damage and a
 * draw) never plays a chord of cues.
 */
export function pickCues(before: CueSnapshot | null, now: CueSnapshot, myId: string | null, autoPassing: boolean): Cue[] {
  // the first view of a game (or a reconnect) sets the baseline silently
  if (!before || before.turn === 0) return [];
  if (now.over && !before.over) return [now.won ? 'victory' : 'defeat'];
  if (now.over) return [];
  const heard = cuesIn(before, now, myId, autoPassing);
  const lead = PRIORITY.find((cue) => heard.has(cue));
  if (!lead) return [];
  const companion = COMPANIONS.find((cue) => cue !== lead && heard.has(cue));
  if (!companion) return [lead];
  // the untap comes first in a turn
  return companion === 'untap' ? [companion, lead] : [lead, companion];
}

/**
 * Moments the board doesn't show, from the game log's lines (gameLog.ts has the server's wording): a shuffle, a
 * counterspell, a mulligan.
 */
const LOG_CUES: [RegExp, Cue][] = [
  [/\bis countered by\b/i, 'counter'],
  // "Bob mulligans down to 6 cards", "Bob mulligans for free", "Bob mulligans to 6 cards"
  [/\bmulligans (down to|for free|to \d)/i, 'mulligan'],
  // "Bob shuffles two cards into their library", "Bob's library is shuffled"
  [/\bshuffles\b|\blibrary is shuffled\b/i, 'shuffle'],
];

export function logCue(text: string): Cue | null {
  return LOG_CUES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function cueAllowed(cue: Cue, settings: { sound: boolean; volume: number; importantCuesOnly?: boolean }): boolean {
  if (!settings.sound || settings.volume <= 0) return false;
  return !settings.importantCuesOnly || IMPORTANT_CUES.has(cue);
}
