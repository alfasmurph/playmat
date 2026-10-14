// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deckStorage } from '../../core/decks/DeckStorageService';
import type { DeckCardLists } from '../../core/decks/types';
import { deckKind, rosterOf, STARTER_PREFIX, useDecks } from './decks';

const BURN: DeckCardLists = {
  name: 'Burn',
  format: 'Constructed - Modern',
  cards: [{ amount: 4, cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146' }],
  sideboard: [],
  source: { site: 'moxfield', url: 'https://moxfield.com/decks/x', remoteId: 'x', importedAt: 1 },
};

const STARTER = { file: 'red.dck', name: 'Red Starter', cards: 60, cover: { name: 'Shock', setCode: 'M19', cardNumber: '156' } };

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('index.json')) return new Response(JSON.stringify([STARTER]), { status: 200 });
    if (url.endsWith('red.dck')) return new Response('20 [M19:156] Shock\n40 [M19:280] Mountain\n', { status: 200 });
    return new Response(null, { status: 404 });
  }));
  useDecks.setState({ saved: [], starters: [], selectedId: null, sleeves: {}, loaded: false });
});

describe('deck library', () => {
  test('playing a starter keeps its name, and the roster marks the copy as the starter\'s', async () => {
    await useDecks.getState().refresh();
    const { id } = await useDecks.getState().loadForPlay(STARTER_PREFIX + STARTER.file);
    const roster = rosterOf(useDecks.getState());
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ id, name: 'Red Starter', fromStarter: true });
  });

  test('duplicate saves a renamed copy with the same cards and sleeve, without the import source', async () => {
    const id = await deckStorage.saveDeck(BURN, { forceNew: true });
    await useDecks.getState().refresh();
    useDecks.getState().setSleeve(id, '#3b1f2b');

    const copyId = await useDecks.getState().duplicate(id);
    expect(copyId).not.toBe(id);
    const copy = await deckStorage.loadDeck(copyId);
    expect(copy).toMatchObject({ name: 'Burn (copy)', format: 'Constructed - Modern', cards: BURN.cards });
    expect(copy?.source).toBeUndefined();
    expect(useDecks.getState().selectedId).toBe(copyId);
    expect(useDecks.getState().sleeves[copyId]).toBe('#3b1f2b');
    expect(useDecks.getState().saved.map((deck) => deck.name).sort()).toEqual(['Burn', 'Burn (copy)']);

    // the original is untouched, and a second copy gets the next free name
    expect((await deckStorage.loadDeck(id))?.source?.site).toBe('moxfield');
    const second = await useDecks.getState().duplicate(id);
    expect((await deckStorage.loadDeck(second))?.name).toBe('Burn (copy 2)');
  });

  test('a starter deck can be duplicated into the library', async () => {
    await useDecks.getState().refresh();
    const copyId = await useDecks.getState().duplicate(STARTER_PREFIX + STARTER.file);
    expect(await deckStorage.loadDeck(copyId)).toMatchObject({
      name: 'Red Starter (copy)',
      format: 'Constructed - Freeform',
      coverCard: STARTER.cover,
    });
  });

  test('rename keeps the deck id and its cards', async () => {
    const id = await deckStorage.saveDeck(BURN, { forceNew: true });
    await useDecks.getState().refresh();
    await useDecks.getState().rename(id, '  Boros Burn ');
    const renamed = await deckStorage.loadDeck(id);
    expect(renamed).toMatchObject({ name: 'Boros Burn', cards: BURN.cards });
    expect(useDecks.getState().saved).toHaveLength(1);
    expect(useDecks.getState().saved[0]).toMatchObject({ id, name: 'Boros Burn' });
    await expect(useDecks.getState().rename(id, '   ')).rejects.toThrow(/needs a name/);
    await expect(useDecks.getState().rename('missing', 'X')).rejects.toThrow(/no longer saved/);
  });

  test('loadList reads saved and starter decks without saving anything', async () => {
    const id = await deckStorage.saveDeck(BURN, { forceNew: true });
    await useDecks.getState().refresh();
    expect(await useDecks.getState().loadList(id)).toMatchObject({ id, name: 'Burn' });
    const starter = await useDecks.getState().loadList(STARTER_PREFIX + STARTER.file);
    expect(starter.name).toBe('Red Starter');
    expect(starter.cards.reduce((sum, card) => sum + card.amount, 0)).toBe(60);
    expect(await deckStorage.listDecks()).toHaveLength(1);
  });
});

describe('deckKind', () => {
  test('a commander format is a commander deck, whatever its size', () => {
    expect(deckKind({ format: 'Variant Magic - Commander', cards: 99, sideboard: 1 })).toBe('commander');
    expect(deckKind({ format: 'Variant Magic - Brawl', cards: 59, sideboard: 1 })).toBe('commander');
    expect(deckKind({ format: 'Variant Magic - Freeform Commander', cards: 0, sideboard: 0 })).toBe('commander');
  });

  test('any other named format is a 60-card deck, even at a hundred cards', () => {
    expect(deckKind({ format: 'Constructed - Modern', cards: 60, sideboard: 15 })).toBe('standard');
    expect(deckKind({ format: 'Constructed - Canadian Highlander', cards: 100, sideboard: 0 })).toBe('standard');
    expect(deckKind({ format: 'Constructed - Pauper', cards: 99, sideboard: 1 })).toBe('standard');
    expect(deckKind({ format: 'Limited', cards: 40, sideboard: 0 })).toBe('standard');
  });

  test('no format, or Freeform, goes by the shape: a commander or two and about a hundred cards', () => {
    expect(deckKind({ cards: 99, sideboard: 1 })).toBe('commander');
    expect(deckKind({ format: 'Constructed - Freeform', cards: 98, sideboard: 2 })).toBe('commander');
    expect(deckKind({ format: '', cards: 100, sideboard: 1 })).toBe('commander');
    expect(deckKind({ format: 'Constructed - Freeform', cards: 60, sideboard: 0 })).toBe('standard');
    expect(deckKind({ format: 'Constructed - Freeform', cards: 60, sideboard: 1 })).toBe('standard');
    // a hundred cards without a command zone, or a sideboard bigger than one, is not a commander deck
    expect(deckKind({ cards: 100, sideboard: 0 })).toBe('standard');
    expect(deckKind({ cards: 85, sideboard: 15 })).toBe('standard');
  });

  test('the roster sorts saved decks and starters onto their shelves', async () => {
    const commanderStarter = { ...STARTER, file: 'krenko.dck', name: 'Krenko', cards: 100, format: 'Variant Magic - Commander' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([STARTER, commanderStarter]), { status: 200 })));
    await deckStorage.saveDeck(BURN, { forceNew: true });
    await deckStorage.saveDeck({ name: 'Atraxa', cards: [{ amount: 99, cardName: 'Forest' }], sideboard: [{ amount: 1, cardName: 'Atraxa, Praetors\' Voice' }] }, { forceNew: true });
    await useDecks.getState().refresh();
    const kinds = Object.fromEntries(rosterOf(useDecks.getState()).map((deck) => [deck.name, deck.kind]));
    expect(kinds).toEqual({ Burn: 'standard', Atraxa: 'commander', 'Red Starter': 'standard', Krenko: 'commander' });
  });
});
