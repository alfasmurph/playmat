import { describe, expect, it } from 'vitest';
import type { CardView } from '../../protocol/generated/views';
import type { DeckCardLists } from '../../core/decks/types';
import { addCard, changePrinting, copiesByName, copyLimit, countZone, entryKey, finalizeDeck, groupDeck, isCover, manaCurve, moveCard, removeCard, withCover } from './deckModel';

const empty: DeckCardLists = { name: 'Test', cards: [], sideboard: [] };
const bolt = { cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146' };
const boltAlt = { cardName: 'Lightning Bolt', setCode: '2XM', cardNumber: '129' };
const mountain = { cardName: 'Mountain', setCode: 'M21', cardNumber: '270' };

describe('deck editing', () => {
  it('adds copies to the same printing and keeps printings apart', () => {
    let deck = addCard(empty, 'cards', bolt);
    deck = addCard(deck, 'cards', bolt);
    deck = addCard(deck, 'cards', boltAlt);
    expect(deck.cards).toHaveLength(2);
    expect(countZone(deck, 'cards')).toBe(3);
    expect(copiesByName(deck, 'lightning bolt')).toBe(3);
  });

  it('removes and drops empty entries', () => {
    const deck = removeCard(addCard(empty, 'cards', bolt), 'cards', entryKey(bolt));
    expect(deck.cards).toHaveLength(0);
  });

  it('switches an entry to another printing, merging copies', () => {
    const deck = addCard(addCard(empty, 'cards', bolt, 3), 'cards', boltAlt, 1);
    const changed = changePrinting(deck, 'cards', entryKey(bolt), boltAlt);
    expect(changed.cards).toEqual([{ ...boltAlt, amount: 4 }]);
    expect(changePrinting(deck, 'cards', entryKey(bolt), bolt)).toBe(deck);
  });

  it('moves cards between main deck and sideboard', () => {
    const deck = moveCard(addCard(empty, 'cards', bolt, 3), 'cards', entryKey(bolt), 2);
    expect(countZone(deck, 'cards')).toBe(1);
    expect(countZone(deck, 'sideboard')).toBe(2);
  });
});

describe('copyLimit', () => {
  it('allows four of a card, any number of basics and of cards that say so', () => {
    expect(copyLimit(undefined, 'Lightning Bolt')).toBe(4);
    expect(copyLimit(undefined, 'Mountain')).toBe(Infinity);
    expect(copyLimit({ rules: ['A deck can have any number of cards named Relentless Rats.'] }, 'Relentless Rats')).toBe(Infinity);
    expect(copyLimit({ rules: ['A deck can have up to seven cards named Seven Dwarves.'] }, 'Seven Dwarves')).toBe(7);
  });

  it('allows one copy in singleton formats, basics aside', () => {
    expect(copyLimit(undefined, 'Sol Ring', true)).toBe(1);
    expect(copyLimit(undefined, 'Forest', true)).toBe(Infinity);
    expect(copyLimit({ rules: ['A deck can have any number of cards named Relentless Rats.'] }, 'Relentless Rats', true)).toBe(Infinity);
  });
});

describe('grouping and curve', () => {
  const info = new Map<string, CardView>([
    [entryKey(bolt), { name: 'Lightning Bolt', cardTypes: ['INSTANT'], manaValue: 1 }],
    [entryKey(mountain), { name: 'Mountain', cardTypes: ['LAND'], manaValue: 0 }],
  ]);
  const deck = addCard(addCard(addCard(empty, 'cards', bolt, 4), 'cards', mountain, 20), 'cards', { cardName: 'Mystery', setCode: '', cardNumber: '' });

  it('groups by type with unknown cards last', () => {
    expect(groupDeck(deck.cards, info).map((group) => [group.key, group.count])).toEqual([['spells', 4], ['lands', 20], ['unknown', 1]]);
  });

  it('counts nonland cards by mana value', () => {
    expect(manaCurve(deck.cards, info)).toEqual([0, 4, 0, 0, 0, 0, 0, 0]);
  });
});

describe('deck cover', () => {
  // an imported Commander list that names no printings: the card info knows them
  const queen = { cardName: 'Najeela, the Blade-Blossom', setCode: '', cardNumber: '' };
  const titan = { cardName: 'Inferno Titan', setCode: '', cardNumber: '' };
  const info = new Map<string, CardView>([
    [entryKey(queen), { name: queen.cardName, cardTypes: ['CREATURE'], manaValue: 3, expansionSetCode: 'BBD', cardNumber: '62' }],
    [entryKey(titan), { name: titan.cardName, cardTypes: ['CREATURE'], manaValue: 6, expansionSetCode: 'M12', cardNumber: '146' }],
    [entryKey(bolt), { name: 'Lightning Bolt', cardTypes: ['INSTANT'], manaValue: 1 }],
  ]);
  const commanderDeck: DeckCardLists = { ...empty, format: 'Variant Magic - Commander', cards: [{ ...titan, amount: 1 }, { ...bolt, amount: 1 }], sideboard: [{ ...queen, amount: 1 }] };

  it('defaults to the commander, from its resolved printing', () => {
    expect(finalizeDeck(commanderDeck, info).coverCard).toEqual({ setCode: 'BBD', cardNumber: '62', name: queen.cardName });
  });

  it('defaults to the most expensive nonland card outside Commander', () => {
    expect(finalizeDeck({ ...commanderDeck, format: 'Constructed - Freeform' }, info).coverCard?.name).toBe(titan.cardName);
  });

  it('keeps a chosen cover, and marks it by name', () => {
    const chosen = withCover(commanderDeck, { ...bolt, amount: 1 }, info.get(entryKey(bolt)));
    expect(chosen.coverCard).toEqual({ setCode: 'M10', cardNumber: '146', name: 'Lightning Bolt' });
    expect(finalizeDeck(chosen, info).coverCard?.name).toBe('Lightning Bolt');
    expect(isCover(chosen, { ...boltAlt, amount: 1 })).toBe(true);
    expect(isCover(chosen, { ...titan, amount: 1 })).toBe(false);
  });

  it('leaves the deck alone when no printing is known', () => {
    const mystery = { cardName: 'Mystery', setCode: '', cardNumber: '', amount: 1 };
    expect(withCover(commanderDeck, mystery, undefined)).toBe(commanderDeck);
  });
});
