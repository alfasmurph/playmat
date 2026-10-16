// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { goldfishDeck } from './play';
import { aiDecks, botName } from './aiSeats';
import { useDecks } from './decks';
import type { DeckCardLists } from '../../core/decks/types';

describe('goldfishDeck', () => {
  test('is only lands, so the goldfish never casts anything', () => {
    const deck = goldfishDeck(false);
    expect(deck.cards).toEqual([{ cardName: 'Plains', amount: 60 }]);
    expect(deck.sideboard).toEqual([]);
  });

  test('has a commander for a commander game, with a hundred cards in all', () => {
    const deck = goldfishDeck(true);
    const total = [...deck.cards, ...deck.sideboard].reduce((sum, card) => sum + card.amount, 0);
    expect(total).toBe(100);
    expect(deck.sideboard).toHaveLength(1);
  });
});

describe('botName', () => {
  const deck = (name: string, ...commanders: string[]) => ({ name, sideboard: commanders.map((cardName) => ({ cardName })) });

  test('a commander deck plays under its commander\'s first name; partners share the seat', () => {
    expect(botName(deck('Ulalek deck', 'Ulalek, Fused Atrocity'), true, [])).toBe('Ulalek');
    expect(botName(deck('x', 'Kefka, Court Mage // Kefka, Ruler of Ruin'), true, [])).toBe('Kefka');
    expect(botName(deck('x', 'The Ur-Dragon'), true, [])).toBe('The Ur-Dragon');
    expect(botName(deck('x', 'Akiri, Line-Slinger', 'Silas Renn, Seeker Adept'), true, [])).toBe('Akiri & Silas Renn');
  });

  test('other decks play under the deck\'s name, and a second of a name is numbered', () => {
    expect(botName(deck('Mono Red Burn', 'Lightning Bolt'), false, [])).toBe('Mono Red Burn');
    expect(botName(deck('x', 'Krenko, Mob Boss'), true, ['stag', 'Krenko'])).toBe('Krenko 2');
    expect(botName(deck('x', 'Krenko, Mob Boss'), true, ['Krenko', 'Krenko 2'])).toBe('Krenko 3');
  });
});

describe('aiDecks', () => {
  const commanderDeck = (name: string): DeckCardLists => ({ name, format: 'Variant Magic - Commander', cards: [{ cardName: 'Forest', amount: 99 }], sideboard: [{ cardName: name, amount: 1 }] });
  const original = useDecks.getState();
  afterEach(() => {
    useDecks.setState(original, true);
    vi.unstubAllGlobals();
  });

  test('each seat plays its picked deck; an unpicked seat, or one picked of the other kind, gets a starter not already at the table', async () => {
    const lists: Record<string, DeckCardLists> = {
      mine: commanderDeck('Ulalek, Fused Atrocity'),
      standard: { name: 'Burn', format: 'Constructed - Standard', cards: [{ cardName: 'Mountain', amount: 60 }], sideboard: [] },
    };
    useDecks.setState({
      loadList: async (id: string) => structuredClone(lists[id]),
      loadPrecons: async () => [],
      starters: [
        { file: 'a.dck', name: 'Starter A', format: 'Variant Magic - Commander' },
        { file: 'b.dck', name: 'Starter B', format: 'Variant Magic - Commander' },
      ] as never,
    });
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url);
      return new Response('100 [CMD:1] Forest\n');
    });
    const decks = await aiDecks(['mine', 'standard', null], 3, true);
    expect(decks.map((deck) => deck.name)).toEqual(['Ulalek, Fused Atrocity', expect.stringMatching(/^Starter [AB]$/), expect.stringMatching(/^Starter [AB]$/)]);
    expect(new Set(decks.map((deck) => deck.name)).size).toBe(3);
    expect(fetched).toHaveLength(2);
  });

  test('a random seat doesn\'t play the player\'s own deck while another is left', async () => {
    useDecks.setState({
      loadList: async () => { throw new Error('none picked'); },
      loadPrecons: async () => [],
      starters: [
        { file: 'a.dck', name: 'Starter A', format: 'Variant Magic - Commander' },
        { file: 'b.dck', name: 'Starter B', format: 'Variant Magic - Commander' },
      ] as never,
    });
    vi.stubGlobal('fetch', async () => new Response('100 [CMD:1] Forest\n'));
    for (let round = 0; round < 10; round += 1) {
      const [deck] = await aiDecks([], 1, true, 'Starter A');
      expect(deck.name).toBe('Starter B');
    }
  });
});
