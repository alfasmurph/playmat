import { describe, expect, it } from 'vitest';
import type { GameSessionState } from '../../core/game/gameSession';
import type { GameEventView, GameView } from '../../protocol/generated/views';
import { cueAllowed, cueSnapshot, logCue, pickCues, type CueSnapshot } from './cueRules';

const base: CueSnapshot = {
  turn: 3, active: 'opp', deciding: false, stack: 0, hand: 5, life: new Map([['me', 20], ['opp', 20]]),
  myLands: 3, attackers: 0, attackPower: 0, blockers: 0, myClock: null, over: false, won: false,
  mine: new Map([['forest', false], ['swamp', false], ['bear', false]]),
  creatures: new Map([['bear', 'Grizzly Bears'], ['ogre', 'Gray Ogre']]),
  tokens: new Set(), damage: new Map(), graveyard: new Map([['old', 'Shock']]),
  handCounts: new Map([['me', 5], ['opp', 4]]), graveCounts: new Map([['me', 1], ['opp', 0]]), exiled: 0, events: null,
};
const next = (patch: Partial<CueSnapshot>): CueSnapshot => ({ ...base, ...patch });
const pick = (before: CueSnapshot | null, now: CueSnapshot, autoPassing = false) => pickCues(before, now, 'me', autoPassing);
const zone = (fromZone: string, toZone: string, targetId?: string): GameEventView => ({ kind: 'ZONE', fromZone, toZone, targetId });

describe('pickCues', () => {
  it('stays silent on the first view', () => {
    expect(pick(null, base)).toEqual([]);
    expect(pick(next({ turn: 0 }), base)).toEqual([]);
  });

  it('announces the result over everything else', () => {
    expect(pick(base, next({ over: true, won: true, stack: 2 }))).toEqual(['victory']);
    expect(pick(base, next({ over: true }))).toEqual(['defeat']);
    expect(pick(next({ over: true }), next({ over: true, stack: 1 }))).toEqual([]);
  });

  it('marks your turn, not theirs', () => {
    expect(pick(base, next({ turn: 4, active: 'me' }))).toEqual(['turn']);
    expect(pick(base, next({ turn: 4, active: 'opp2' }))).toEqual([]);
  });

  it('warns once when your clock runs low', () => {
    expect(pick(next({ myClock: 14 }), next({ myClock: 9 }))).toEqual(['timer']);
    expect(pick(next({ myClock: 9 }), next({ myClock: 8 }))).toEqual([]);
    expect(pick(base, next({ myClock: 30 }))).toEqual([]);
  });

  it('hears combat, spells and their results', () => {
    expect(pick(base, next({ attackers: 2, attackPower: 4 }))).toEqual(['attack']);
    expect(pick(next({ attackers: 2 }), next({ attackers: 2, blockers: 1 }))).toEqual(['block']);
    expect(pick(base, next({ stack: 1 }))).toEqual(['cast']);
    expect(pick(next({ stack: 1 }), next({ stack: 0 }))).toEqual(['resolve']);
    expect(pick(next({ stack: 1 }), next({ stack: 0, life: new Map([['me', 20], ['opp', 17]]) }))).toEqual(['damage']);
    expect(pick(base, next({ life: new Map([['me', 23], ['opp', 20]]) }))).toEqual(['lifeGain']);
  });

  it('hears lands and draws within a turn', () => {
    expect(pick(base, next({ myLands: 4, hand: 4 }))).toEqual(['land']);
    expect(pick(base, next({ hand: 6 }))).toEqual(['draw']);
  });

  it('chimes for a decision unless the client answers it', () => {
    expect(pick(base, next({ deciding: true }))).toEqual(['decide']);
    expect(pick(base, next({ deciding: true }), true)).toEqual([]);
  });

  it('makes a big attack of three attackers or ten power', () => {
    expect(pick(base, next({ attackers: 3, attackPower: 6 }))).toEqual(['attackBig']);
    expect(pick(base, next({ attackers: 1, attackPower: 10 }))).toEqual(['attackBig']);
    expect(pick(base, next({ attackers: 2, attackPower: 9 }))).toEqual(['attack']);
  });

  it('makes a big hit of five damage to one player or creature', () => {
    expect(pick(base, next({ life: new Map([['me', 15], ['opp', 20]]) }))).toEqual(['damageBig']);
    expect(pick(base, next({ life: new Map([['me', 16], ['opp', 20]]) }))).toEqual(['damage']);
    // damage marked on a creature that survives
    expect(pick(base, next({ damage: new Map([['ogre', 5]]) }))).toEqual(['damageBig']);
    expect(pick(base, next({ damage: new Map([['ogre', 2]]) }))).toEqual(['damage']);
    // the server's events: six to a creature that died of it (no marked damage left to see)
    const events: GameEventView[] = [{ kind: 'DAMAGE', targetId: 'ogre', amount: 6 }, zone('BATTLEFIELD', 'GRAVEYARD', 'ogre')];
    expect(pick(base, next({ events, creatures: new Map([['bear', 'Grizzly Bears']]) }))).toEqual(['damageBig', 'creatureDies']);
    // split damage isn't one big hit
    const split: GameEventView[] = [{ kind: 'DAMAGE', targetId: 'me', amount: 3 }, { kind: 'DAMAGE', targetId: 'opp', amount: 3 }];
    expect(pick(base, next({ events: split, life: new Map([['me', 17], ['opp', 17]]) }))).toEqual(['damage']);
  });

  it('hears a creature die, from the events or from its card reaching a graveyard', () => {
    const gone = new Map([['bear', 'Grizzly Bears']]);
    expect(pick(base, next({ events: [zone('BATTLEFIELD', 'GRAVEYARD', 'ogre')], creatures: gone }))).toEqual(['creatureDies']);
    // a land going to the graveyard isn't a death
    expect(pick(base, next({ events: [zone('BATTLEFIELD', 'GRAVEYARD', 'forest')] }))).toEqual([]);
    // no events: same id in a graveyard, or a new card of the same name (a copy with a new id)
    expect(pick(base, next({ creatures: gone, graveyard: new Map([['old', 'Shock'], ['ogre', 'Gray Ogre']]) }))).toEqual(['creatureDies']);
    expect(pick(base, next({ creatures: gone, graveyard: new Map([['old', 'Shock'], ['x1', 'Gray Ogre']]) }))).toEqual(['creatureDies']);
    // bounced to a hand: nothing reached a graveyard
    expect(pick(base, next({ creatures: gone }))).toEqual([]);
    // a spell that kills: the resolve, then the death
    expect(pick(next({ stack: 1 }), next({ stack: 0, creatures: gone, graveyard: new Map([['old', 'Shock'], ['ogre', 'Gray Ogre']]) })))
      .toEqual(['resolve', 'creatureDies']);
  });

  it('hears new tokens, after the spell that made them', () => {
    expect(pick(base, next({ tokens: new Set(['t1']) }))).toEqual(['token']);
    expect(pick(next({ stack: 1 }), next({ stack: 0, tokens: new Set(['t1', 't2']) }))).toEqual(['resolve', 'token']);
    expect(pick(next({ tokens: new Set(['t1']) }), next({ tokens: new Set(['t1']) }))).toEqual([]);
  });

  it('hears exile grow', () => {
    expect(pick(base, next({ exiled: 1 }))).toEqual(['exile']);
    expect(pick(next({ exiled: 2 }), next({ exiled: 1 }))).toEqual([]);
  });

  it('hears a discard, not a spell cast', () => {
    expect(pick(base, next({ events: [zone('HAND', 'GRAVEYARD')] }))).toEqual(['discard']);
    // the events say it was cast and resolved, though the hand shrank and the graveyard grew
    const cast: GameEventView[] = [{ kind: 'CAST' }, zone('HAND', 'STACK', 'bolt'), zone('STACK', 'GRAVEYARD', 'bolt')];
    expect(pick(base, next({ events: cast, handCounts: new Map([['me', 4], ['opp', 4]]), graveCounts: new Map([['me', 2], ['opp', 0]]) }))).toEqual([]);
    // no events: a hand shrank and its owner's graveyard grew with the stack unchanged
    expect(pick(base, next({ handCounts: new Map([['me', 5], ['opp', 3]]), graveCounts: new Map([['me', 1], ['opp', 1]]) }))).toEqual(['discard']);
    expect(pick(base, next({ handCounts: new Map([['me', 5], ['opp', 3]]), graveCounts: new Map([['me', 2], ['opp', 0]]) }))).toEqual([]);
    expect(pick(next({ stack: 1 }), next({ stack: 0, handCounts: new Map([['me', 5], ['opp', 3]]), graveCounts: new Map([['me', 1], ['opp', 1]]) })))
      .toEqual(['resolve']);
  });

  it('hears your permanents tap, but not ones that enter tapped', () => {
    expect(pick(base, next({ mine: new Map([['forest', true], ['swamp', false], ['bear', false]]) }))).toEqual(['tap']);
    expect(pick(base, next({ mine: new Map([...base.mine, ['tapland', true]]) }))).toEqual([]);
    // tapping attackers is the attack
    expect(pick(base, next({ attackers: 1, attackPower: 2, mine: new Map([['forest', false], ['swamp', false], ['bear', true]]) }))).toEqual(['attack']);
  });

  it('hears your untap step, just before your turn', () => {
    const tapped = next({ mine: new Map([['forest', true], ['swamp', true], ['bear', false]]) });
    expect(pick(tapped, next({ turn: 4, active: 'me' }))).toEqual(['untap', 'turn']);
    expect(pick(next({ ...tapped, active: 'me' }), next({ active: 'me' }))).toEqual(['untap']);
    // one permanent untapping is an effect, not the untap step
    expect(pick(next({ ...tapped, mine: new Map([['forest', true]]) }), next({ active: 'me', mine: new Map([['forest', false]]) }))).toEqual([]);
    expect(pick(tapped, next({ turn: 4, active: 'opp' }))).toEqual([]);
  });

  it('reads events only once: a view repeated for a prompt carries the same ones', () => {
    const events = [zone('HAND', 'GRAVEYARD')];
    expect(pick(next({ events }), next({ events, deciding: true }))).toEqual(['decide']);
  });
});

describe('cueSnapshot', () => {
  it('reads the board from the view', () => {
    const view: GameView = {
      turn: 5, activePlayerId: 'me',
      combat: [{ attackers: { a1: { power: '4' }, a2: { power: '*' } } }],
      exiles: [{ e1: {}, e2: {} }],
      events: [zone('HAND', 'GRAVEYARD')],
      players: [
        {
          playerId: 'me', life: 18, handCount: 3,
          battlefield: { f1: { cardTypes: ['LAND'], tapped: true }, c1: { cardTypes: ['CREATURE'], name: 'Bear', damage: 1 }, t1: { isToken: true, cardTypes: ['CREATURE'], name: 'Soldier' } },
          graveyard: { g1: { name: 'Shock' } },
          exile: { e1: {} },
        },
        { playerId: 'opp', life: 20, handCount: 7, battlefield: { o1: { cardTypes: ['CREATURE'], name: 'Ogre', tapped: true } } },
      ],
    };
    const state = { view, mode: 'play', interaction: { mode: 'waiting' }, awaitingServer: false, gameOver: null, endInfo: null } as unknown as GameSessionState;
    const snap = cueSnapshot(state, 'me');
    expect(snap.mine).toEqual(new Map([['f1', true], ['c1', false], ['t1', false]]));
    expect(snap.creatures).toEqual(new Map([['c1', 'Bear'], ['t1', 'Soldier'], ['o1', 'Ogre']]));
    expect(snap.tokens).toEqual(new Set(['t1']));
    expect(snap.damage).toEqual(new Map([['c1', 1]]));
    expect(snap.graveyard).toEqual(new Map([['g1', 'Shock']]));
    expect(snap.handCounts).toEqual(new Map([['me', 3], ['opp', 7]]));
    expect(snap.graveCounts).toEqual(new Map([['me', 1], ['opp', 0]]));
    expect(snap.exiled).toBe(2);
    expect(snap.attackers).toBe(2);
    expect(snap.attackPower).toBe(4);
    expect(snap.myLands).toBe(1);
    expect(snap.events).toBe(view.events);
  });
});

describe('logCue', () => {
  it('hears shuffles, counterspells and mulligans in the log', () => {
    expect(logCue("Bob's library is shuffled")).toBe('shuffle');
    expect(logCue('Bob shuffles two cards into their library (Brainstone)')).toBe('shuffle');
    expect(logCue('Lightning Bolt is countered by Counterspell')).toBe('counter');
    expect(logCue('Lightning Bolt could not be countered by Counterspell')).toBeNull();
    expect(logCue('Bob mulligans down to 6 cards')).toBe('mulligan');
    expect(logCue('Bob mulligans for free and draws 7 cards')).toBe('mulligan');
    expect(logCue('Bob mulligans to 6 cards')).toBe('mulligan');
    expect(logCue('Bob keeps hand')).toBeNull();
    expect(logCue('Bob casts Lightning Bolt')).toBeNull();
  });
});

describe('cueAllowed', () => {
  it('follows the sound settings', () => {
    expect(cueAllowed('draw', { sound: true, volume: 0.5 })).toBe(true);
    expect(cueAllowed('draw', { sound: false, volume: 0.5 })).toBe(false);
    expect(cueAllowed('draw', { sound: true, volume: 0 })).toBe(false);
    expect(cueAllowed('draw', { sound: true, volume: 0.5, importantCuesOnly: true })).toBe(false);
    expect(cueAllowed('turn', { sound: true, volume: 0.5, importantCuesOnly: true })).toBe(true);
  });
});
