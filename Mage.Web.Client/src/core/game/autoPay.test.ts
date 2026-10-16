import { describe, expect, it } from 'vitest';
import type { CardView, PermanentView } from '../../protocol/generated/views';
import {
  canSpend, handNeeds, manaChoiceAnswer, manaOf, manaSource, nextPoolMana, nextSource, nextTap, parseCost, type ManaCostParts, type ManaSource,
} from './autoPay';
import { parsePrompt } from './prompt';

const source = (id: string, colors: ManaSource['colors'], extra: Partial<ManaSource> = {}): ManaSource => ({
  id, colors, amount: 1, isLand: false, basic: false, restricted: false, noUntap: false, costly: false, ...extra,
});
const basic = (id: string, color: ManaSource['colors'][number]) => source(id, [color], { isLand: true, basic: true });
const land = (id: string, colors: ManaSource['colors'], extra: Partial<ManaSource> = {}) => source(id, colors, { isLand: true, ...extra });
const dork = (id: string, color: ManaSource['colors'][number]) => source(id, [color]);

/** Real cards as the server describes them (rules text from the cards' abilities). */
const CARDS = {
  workshop: { name: "Mishra's Workshop", cardTypes: ['LAND'], rules: ['{T}: Add {C}{C}{C}. Spend this mana only to cast artifact spells.'] },
  vault: {
    name: 'Mana Vault',
    cardTypes: ['ARTIFACT'],
    rules: [
      "Mana Vault doesn't untap during your untap step.",
      'At the beginning of your upkeep, you may pay {4}. If you do, untap Mana Vault.',
      'At the beginning of your draw step, if Mana Vault is tapped, it deals 1 damage to you.',
      '{T}: Add {C}{C}{C}.',
    ],
  },
  tomb: { name: 'Ancient Tomb', cardTypes: ['LAND'], rules: ['{T}: Add {C}{C}. Ancient Tomb deals 2 damage to you.'] },
  solRing: { name: 'Sol Ring', cardTypes: ['ARTIFACT'], rules: ['{T}: Add {C}{C}.'] },
  tower: { name: 'Command Tower', cardTypes: ['LAND'], rules: ["{T}: Add one mana of any color in your commander's color identity."] },
  sea: { name: 'Underground Sea', cardTypes: ['LAND'], subTypes: ['ISLAND', 'SWAMP'], rules: ['<i>({T}: Add {U} or {B}.)</i>'] },
  city: {
    name: 'City of Brass',
    cardTypes: ['LAND'],
    rules: ['Whenever City of Brass becomes tapped, it deals 1 damage to you.', '{T}: Add one mana of any color.'],
  },
  elves: { name: 'Llanowar Elves', cardTypes: ['CREATURE'], subTypes: ['ELF', 'DRUID'], rules: ['{T}: Add {G}.'] },
  island: { name: 'Island', cardTypes: ['LAND'], superTypes: ['BASIC'], subTypes: ['ISLAND'], rules: ['<i>({T}: Add {U}.)</i>'] },
  painland: { name: 'Underground River', cardTypes: ['LAND'], rules: ['{T}: Add {C}.', '{T}: Add {U} or {B}. Underground River deals 1 damage to you.'] },
} satisfies Record<string, Pick<PermanentView, 'name' | 'cardTypes' | 'subTypes' | 'superTypes' | 'rules'>>;

const ARTIFACT_SPELL = { cardTypes: ['ARTIFACT'] } satisfies Pick<CardView, 'cardTypes'>;
const CREATURE_SPELL = { cardTypes: ['CREATURE'] } satisfies Pick<CardView, 'cardTypes'>;

/** A board source read from a real card, as auto-pay builds it while paying for `spell`. */
function read(id: string, card: keyof typeof CARDS, spell: Pick<CardView, 'cardTypes'> | null = ARTIFACT_SPELL): ManaSource {
  return manaSource(id, CARDS[card], spell)!;
}

describe('parseCost', () => {
  it('reads generic and colored symbols', () => {
    expect(parseCost('Pay {2}{G}{G} Llanowar Elves')).toEqual({ generic: 2, colored: { G: 2 } });
  });
  it('refuses symbols that need a choice', () => {
    expect(parseCost('Pay {X}{R}')).toBeNull();
    expect(parseCost('Pay {G/W}')).toBeNull();
    expect(parseCost('Pay {B/P}')).toBeNull();
    expect(parseCost('Choose a card')).toBeNull();
  });
});

describe('manaOf', () => {
  it('reads basic land types and simple mana abilities', () => {
    expect(manaOf({ subTypes: ['FOREST'] })).toMatchObject({ colors: ['G'], amount: 1 });
    expect(manaOf({ rules: ['{T}: Add {C}.'] })).toMatchObject({ colors: ['C'], amount: 1, costly: false });
    expect(manaOf({ rules: ['{T}: Add {R}.'], cardTypes: ['CREATURE'] })).toMatchObject({ colors: ['R'], isLand: false });
    expect(manaOf({ rules: ['Flying'] })).toBeUndefined();
  });
  it('counts the mana one activation adds', () => {
    expect(manaOf({ rules: ['{T}: Add {C}{C}{C}.'] })?.amount).toBe(3);
    expect(manaOf({ rules: ['{T}: Add {C}{C}'] })?.amount).toBe(2);
    expect(manaOf({ rules: ['{T}: Add one mana of any color.'] })).toMatchObject({ amount: 1, colors: ['W', 'U', 'B', 'R', 'G'] });
    expect(manaOf({ rules: ['{T}: Add {W} or {U}.'] })).toMatchObject({ amount: 1, colors: ['W', 'U'] });
    expect(manaOf({ subTypes: ['PLAINS', 'ISLAND'] })).toMatchObject({ amount: 1, colors: ['W', 'U'] });
    expect(manaOf({ rules: ['{T}: Add {G} for each Elf you control.'] })).toBeUndefined();
  });
  it('reads restrictions, untap and extra costs from real cards', () => {
    const flags = (card: keyof typeof CARDS) => {
      const { restricted, noUntap, costly, amount, basic: isBasic } = manaOf(CARDS[card])!;
      return { restricted, noUntap, costly, amount, basic: isBasic };
    };
    expect(flags('workshop')).toEqual({ restricted: true, noUntap: false, costly: false, amount: 3, basic: false });
    expect(manaOf(CARDS.workshop)?.restriction).toBe('Spend this mana only to cast artifact spells.');
    expect(flags('vault')).toEqual({ restricted: false, noUntap: true, costly: false, amount: 3, basic: false });
    expect(flags('tomb')).toEqual({ restricted: false, noUntap: false, costly: true, amount: 2, basic: false });
    expect(flags('solRing')).toEqual({ restricted: false, noUntap: false, costly: false, amount: 2, basic: false });
    expect(flags('tower')).toEqual({ restricted: false, noUntap: false, costly: false, amount: 1, basic: false });
    expect(manaOf(CARDS.tower)?.colors).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(flags('sea')).toEqual({ restricted: false, noUntap: false, costly: false, amount: 1, basic: false });
    expect(manaOf(CARDS.sea)?.colors).toEqual(['U', 'B']);
    expect(flags('city')).toEqual({ restricted: false, noUntap: false, costly: true, amount: 1, basic: false });
    expect(flags('elves')).toEqual({ restricted: false, noUntap: false, costly: false, amount: 1, basic: false });
    expect(flags('island')).toEqual({ restricted: false, noUntap: false, costly: false, amount: 1, basic: true });
    expect(manaOf({ name: 'Forest', cardTypes: ['LAND'], subTypes: ['FOREST'] })?.basic).toBe(true);
    expect(manaOf({ rules: ['{T}, Pay 1 life: Add {B}.'] })?.costly).toBe(true);
    expect(manaOf({ rules: ['{1}, {T}: Add {U}{B}.'] })).toMatchObject({ costly: true, amount: 2 });
    expect(manaOf({ rules: ['{T}, Sacrifice Lotus Petal: Add one mana of any color.'] })?.costly).toBe(true);
  });
  it('reads a permanent by its free ability when it has one (a painland is a {C} source)', () => {
    expect(manaOf(CARDS.painland)).toMatchObject({ colors: ['C'], costly: false });
  });
});

describe('canSpend', () => {
  it("lets Mishra's Workshop pay for artifact spells only", () => {
    const restriction = manaOf(CARDS.workshop)!.restriction!;
    expect(canSpend(restriction, { cardTypes: ['ARTIFACT'] })).toBe(true);
    expect(canSpend(restriction, { cardTypes: ['ARTIFACT', 'CREATURE'] })).toBe(true);
    expect(canSpend(restriction, { cardTypes: ['CREATURE'] })).toBe(false);
    expect(canSpend(restriction, null)).toBe(false);
  });
  it('refuses restrictions it cannot read', () => {
    expect(canSpend('Spend this mana only on costs that contain {X}.', { cardTypes: ['ARTIFACT'] })).toBe(false);
    expect(canSpend('Spend this mana only to cast a creature spell of the chosen type.', { cardTypes: ['CREATURE'] })).toBe(false);
  });
});

describe('nextSource', () => {
  it('covers colored mana with matching sources first, then generic with lands', () => {
    const sources = [basic('forest', 'G'), basic('mountain', 'R'), dork('elf', 'G')];
    expect(nextSource({ generic: 1, colored: { G: 1 } }, sources)).toBe('forest');
  });
  it('pays generic with what colored symbols do not need', () => {
    // {1}{G} with a Forest and a Mountain: the Mountain pays the generic part, but colored comes first in the plan
    const plan = nextSource({ generic: 1, colored: { G: 1 } }, [basic('mountain', 'R'), basic('forest', 'G')]);
    expect(plan).toBe('forest');
    expect(nextSource({ generic: 1, colored: {} }, [basic('mountain', 'R')])).toBe('mountain');
  });
  it('gives up when the cost cannot be covered', () => {
    expect(nextSource({ generic: 0, colored: { U: 1 } }, [basic('forest', 'G')])).toBeNull();
    expect(nextSource({ generic: 2, colored: {} }, [basic('a', 'G')])).toBeNull();
  });
  it('pays generic mana with a dual land, after basics', () => {
    expect(nextSource({ generic: 1, colored: {} }, [read('sea', 'sea')])).toBe('sea');
    expect(nextSource({ generic: 1, colored: {} }, [read('sea', 'sea'), basic('island', 'U')])).toBe('island');
    expect(nextSource({ generic: 1, colored: {} }, [dork('elf', 'G'), read('sea', 'sea')])).toBe('sea');
  });
  it('pays colored mana with a source that makes the color, single-color ones first', () => {
    expect(nextTap({ generic: 0, colored: { B: 1 } }, [read('sea', 'sea')])).toEqual({ id: 'sea', color: 'B' });
    expect(nextSource({ generic: 0, colored: { U: 1 } }, [read('sea', 'sea'), basic('island', 'U')])).toBe('island');
    expect(nextTap({ generic: 0, colored: { R: 1 } }, [read('tower', 'tower')])).toEqual({ id: 'tower', color: 'R' });
  });
  it('no longer spends colorless first on generic mana', () => {
    expect(nextSource({ generic: 1, colored: {} }, [land('wastes', ['C']), basic('island', 'U')])).toBe('island');
    // colorless sources still pay {C}
    expect(nextSource({ generic: 0, colored: { C: 1 } }, [basic('island', 'U'), land('wastes', ['C'])])).toBe('wastes');
  });
});

describe("fast mana: Mishra's Workshop, Mana Vault, Sol Ring, Ancient Tomb", () => {
  it("never taps Mishra's Workshop for a non-artifact spell", () => {
    // {1}{U} creature with Workshop and two Islands: Workshop isn't a source for it at all
    expect(manaSource('workshop', CARDS.workshop, CREATURE_SPELL)).toBeNull();
    expect(manaSource('workshop', CARDS.workshop, null)).toBeNull();
    const board = [manaSource('workshop', CARDS.workshop, CREATURE_SPELL), read('island1', 'island'), read('island2', 'island')]
      .filter((candidate): candidate is ManaSource => candidate !== null);
    expect(pay({ generic: 1, colored: { U: 1 } }, board)).toEqual([]);
    // even when it reached the plan, a {1} remainder never takes three mana
    expect(nextSource({ generic: 1, colored: {} }, [read('workshop', 'workshop'), basic('island', 'U')])).toBe('island');
  });
  it("taps Mishra's Workshop for an artifact spell it pays without waste", () => {
    const workshop = read('workshop', 'workshop', ARTIFACT_SPELL);
    expect(workshop).toMatchObject({ restricted: true, amount: 3 });
    expect(nextSource({ generic: 3, colored: {} }, [basic('island1', 'U'), basic('island2', 'U'), basic('island3', 'U'), workshop])).toBe('workshop');
    expect(pay({ generic: 4, colored: {} }, [workshop, basic('island', 'U'), basic('swamp', 'B')]).map((left) => left.id)).toEqual(['swamp']);
  });
  it('never taps Mana Vault for a {1} remainder when an Island or a dual is there', () => {
    expect(nextSource({ generic: 1, colored: {} }, [read('vault', 'vault'), basic('island', 'U')])).toBe('island');
    expect(nextSource({ generic: 1, colored: {} }, [read('vault', 'vault'), read('sea', 'sea')])).toBe('sea');
    expect(nextSource({ generic: 1, colored: {} }, [read('vault', 'vault'), read('tomb', 'tomb'), dork('elf', 'G')])).toBe('elf');
  });
  it('hands the payment back when only Mana Vault, Ancient Tomb or City of Brass could pay', () => {
    expect(nextSource({ generic: 1, colored: {} }, [read('vault', 'vault')])).toBeNull();
    expect(nextSource({ generic: 3, colored: {} }, [read('vault', 'vault')])).toBeNull();
    expect(nextSource({ generic: 2, colored: {} }, [read('tomb', 'tomb')])).toBeNull();
    expect(nextSource({ generic: 1, colored: {} }, [read('city', 'city')])).toBeNull();
    // {1}{U} with an Island and a Vault: the Island pays {U}, and the {1} left is the player's to decide
    expect(nextSource({ generic: 1, colored: { U: 1 } }, [basic('island', 'U'), read('vault', 'vault')])).toBeNull();
  });
  it('taps Sol Ring for exactly {2} when nothing better covers it', () => {
    expect(nextSource({ generic: 2, colored: {} }, [read('sol', 'solRing')])).toBe('sol');
    // an Island alone can't cover {2}: Sol Ring pays all of it and the Island stays up
    expect(pay({ generic: 2, colored: {} }, [basic('island', 'U'), read('sol', 'solRing')]).map((left) => left.id)).toEqual(['island']);
    expect(pay({ generic: 3, colored: {} }, [basic('island', 'U'), read('sol', 'solRing')])).toEqual([]);
    // lands first when they are enough, and never Sol Ring for a single mana
    expect(nextSource({ generic: 2, colored: {} }, [read('sol', 'solRing'), basic('island1', 'U'), basic('island2', 'U')])).toBe('island1');
    expect(nextSource({ generic: 1, colored: {} }, [read('sol', 'solRing')])).toBeNull();
  });
  it('colored mana takes a painful source only when nothing else makes the color', () => {
    expect(nextSource({ generic: 0, colored: { R: 1 } }, [read('city', 'city'), read('tower', 'tower')])).toBe('tower');
    expect(nextSource({ generic: 0, colored: { R: 1 } }, [read('city', 'city')])).toBe('city');
  });
});

/** Taps sources one at a time, as the server asks for them, until the cost is paid; returns what's left untapped. */
function pay(cost: ManaCostParts, sources: ManaSource[], hand: string[] = []): ManaSource[] {
  let untapped = [...sources];
  const owed: ManaCostParts = { generic: cost.generic, colored: { ...cost.colored } };
  const total = (parts: ManaCostParts) => parts.generic + Object.values(parts.colored).reduce((sum, value) => sum + (value ?? 0), 0);
  while (total(owed) > 0) {
    const tap = nextTap(owed, untapped, handNeeds(hand, untapped.length - total(owed)));
    const tapped = untapped.find((candidate) => candidate.id === tap?.id);
    if (!tap || !tapped) throw new Error('no source');
    untapped = untapped.filter((candidate) => candidate !== tapped);
    for (let i = 0; i < tapped.amount; i++) {
      if (owed.colored[tap.color]) owed.colored[tap.color]! -= 1;
      else if (owed.generic > 0) owed.generic -= 1;
    }
  }
  return untapped;
}

describe('generic mana and the rest of the hand', () => {
  // Hill Giant {3}{R} with Forest x2, Island x3 and a Mountain untapped, Giant Growth {G} in hand
  const board = [basic('forest1', 'G'), basic('forest2', 'G'), basic('island1', 'U'), basic('island2', 'U'), basic('island3', 'U'), basic('mountain', 'R')];

  it('keeps a Forest up for Giant Growth', () => {
    const left = pay({ generic: 3, colored: { R: 1 } }, board, ['{G}']);
    expect(left.flatMap((source) => source.colors)).toContain('G');
    expect(left).toHaveLength(2);
  });

  it('spends the most plentiful color when the hand needs nothing, so both colors stay open', () => {
    const left = pay({ generic: 3, colored: { R: 1 } }, board, []);
    expect(left.flatMap((source) => source.colors).sort()).toEqual(['G', 'U']);
  });

  it('ignores hand cards the leftover mana could not cast anyway', () => {
    expect(handNeeds(['{G}', '{2}{U}{U}', '{4}'], 2)).toEqual({ G: 1 });
  });

  it('still pays when the hand wants more than is left', () => {
    expect(pay({ generic: 2, colored: {} }, [basic('forest', 'G'), basic('island', 'U')], ['{G}', '{U}'])).toEqual([]);
  });
});

describe('manaChoiceAnswer', () => {
  it("picks the dual's ability that adds the color it was tapped for", () => {
    const prompt = parsePrompt('GAME_CHOOSE_ABILITY', {
      message: 'Choose spell or ability to play<br>Underground Sea [1a2]',
      choices: { blue: '1. {T}: Add {U}.', black: '2. {T}: Add {B}.' },
    });
    expect(manaChoiceAnswer(prompt, 'Underground Sea', 'B')).toEqual({ type: 'uuid', id: 'black' });
    expect(manaChoiceAnswer(prompt, 'Island', 'B')).toBeNull();
    expect(manaChoiceAnswer(prompt, 'Underground Sea', 'G')).toBeNull();
  });
  it('picks the color of "one mana of any color", and nothing for other color choices', () => {
    const colors = { message: 'Pick a mana color', choices: ['White', 'Blue', 'Black', 'Red', 'Green'] };
    const prompt = parsePrompt('GAME_CHOOSE_CHOICE', { message: '', choice: { ...colors, manaColorChoice: true } });
    expect(manaChoiceAnswer(prompt, 'Command Tower', 'R')).toEqual({ type: 'string', value: 'Red' });
    const other = parsePrompt('GAME_CHOOSE_CHOICE', { message: '', choice: { message: 'Choose a creature type', choices: ['Elf'] } });
    expect(manaChoiceAnswer(other, 'Command Tower', 'R')).toBeNull();
  });
});

describe('nextPoolMana', () => {
  it('spends a mixed pool on generic mana, colorless first (Sol Ring and a white mana for Worn Powerstone)', () => {
    expect(nextPoolMana({ generic: 3, colored: {} }, { C: 2, W: 1 })).toBe('C');
    expect(nextPoolMana({ generic: 1, colored: {} }, { W: 1 })).toBe('W');
  });
  it('pays colored symbols with their own color before generic', () => {
    expect(nextPoolMana({ generic: 1, colored: { G: 1 } }, { C: 1, G: 1 })).toBe('G');
  });
  it('keeps colors the hand needs for last', () => {
    expect(nextPoolMana({ generic: 1, colored: {} }, { R: 1, G: 2 }, { G: 1 })).toBe('R');
  });
  it('leaves a pool that cannot pay the cost alone', () => {
    expect(nextPoolMana({ generic: 0, colored: { U: 1 } }, { R: 2, C: 1 })).toBeNull();
    expect(nextPoolMana({ generic: 2, colored: {} }, {})).toBeNull();
  });
});
