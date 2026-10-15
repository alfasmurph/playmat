// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deckStorage } from '../../core/decks/DeckStorageService';
import type { DeckCardLists } from '../../core/decks/types';
import { api } from '../connection';
import { chosenSleeve, deckKind, rosterOf, SHARED_PREFIX, STARTER_PREFIX, useDecks } from './decks';

const BURN: DeckCardLists = {
  name: 'Burn',
  format: 'Constructed - Modern',
  cards: [{ amount: 4, cardName: 'Lightning Bolt', setCode: 'M10', cardNumber: '146' }],
  sideboard: [],
  source: { site: 'moxfield', url: 'https://moxfield.com/decks/x', remoteId: 'x', importedAt: 1 },
};

const PRECONS = [{
  id: 'commander-2011', name: 'Commander 2011', year: 2011,
  decks: [{ file: 'commander-2011/counterpunch.dck', name: 'Counterpunch', cards: 100, commanders: ['Ghave, Guru of Spores'], cover: { name: 'Ghave, Guru of Spores', setCode: 'CMD', cardNumber: '200' } }],
}];
const COUNTERPUNCH = 'precon:commander-2011/counterpunch.dck';

const STARTER = { file: 'red.dck', name: 'Red Starter', cards: 60, cover: { name: 'Shock', setCode: 'M19', cardNumber: '156' } };

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/precons/index.json') return new Response(JSON.stringify(PRECONS), { status: 200 });
    if (url === '/precons/commander-2011/counterpunch.dck') return new Response('NAME:Counterpunch\n99 [CMD:315] Forest\nSB: 1 [CMD:200] Ghave, Guru of Spores\n', { status: 200 });
    if (url.endsWith('index.json')) return new Response(JSON.stringify([STARTER]), { status: 200 });
    if (url.endsWith('red.dck')) return new Response('20 [M19:156] Shock\n40 [M19:280] Mountain\n', { status: 200 });
    return new Response(null, { status: 404 });
  }));
  useDecks.setState({ saved: [], starters: [], shared: [], sharedLists: {}, favorites: [], selectedId: null, sleeves: {}, playingId: null, precons: [], loaded: false });
  vi.restoreAllMocks();
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

describe('precons', () => {
  test('a precon tried out sits on the shelf while selected, and plays as printed without being saved', async () => {
    await useDecks.getState().refresh();
    await useDecks.getState().loadPrecons();
    useDecks.getState().select(COUNTERPUNCH);
    expect(rosterOf(useDecks.getState())[0]).toMatchObject({ id: COUNTERPUNCH, name: 'Counterpunch', kind: 'commander', precon: { set: 'Commander 2011', year: 2011 } });

    const { deck, id } = await useDecks.getState().loadForPlay(COUNTERPUNCH);
    expect(id).toBe(COUNTERPUNCH);
    expect(deck).toMatchObject({ name: 'Counterpunch', format: 'Variant Magic - Commander' });
    expect(deck.sideboard[0]).toMatchObject({ cardName: 'Ghave, Guru of Spores' });
    expect(useDecks.getState().saved).toEqual([]);
    expect(useDecks.getState().playingId).toBe(COUNTERPUNCH);

    // another deck chosen: the precon leaves the shelf
    useDecks.getState().select(STARTER_PREFIX + STARTER.file);
    expect(rosterOf(useDecks.getState()).some((entry) => entry.id === COUNTERPUNCH)).toBe(false);
  });

  test('the selection survives a reload, and a copy is a Commander deck of your own', async () => {
    useDecks.getState().select(COUNTERPUNCH);
    await useDecks.getState().refresh();
    expect(useDecks.getState().selectedId).toBe(COUNTERPUNCH);

    const copyId = await useDecks.getState().duplicate(COUNTERPUNCH);
    expect(await deckStorage.loadDeck(copyId)).toMatchObject({ name: 'Counterpunch', format: 'Variant Magic - Commander' });
    expect(useDecks.getState().selectedId).toBe(copyId);
  });
});

describe('sleeves and the deck in play', () => {
  test('every way into a game marks the deck in play, so its sleeve shows; the builder opening a starter does not', async () => {
    const id = await deckStorage.saveDeck(BURN, { forceNew: true });
    await useDecks.getState().refresh();
    await useDecks.getState().loadForPlay(id);
    expect(useDecks.getState().playingId).toBe(id);
    expect(JSON.parse(localStorage.getItem('playmat.playingDeck') ?? 'null')).toBe(id);

    await useDecks.getState().loadForPlay(STARTER_PREFIX + STARTER.file, { editing: true });
    expect(useDecks.getState().playingId).toBe(id);
  });

  test('sleeves come off, and an unsleeved deck\'s copy stays unsleeved', async () => {
    const id = await deckStorage.saveDeck(BURN, { forceNew: true });
    await useDecks.getState().refresh();
    useDecks.getState().setSleeve(id, '#1f2a44');
    expect(chosenSleeve(useDecks.getState().sleeves, id)).toBe('#1f2a44');
    useDecks.getState().setSleeve(id, null);
    expect(chosenSleeve(useDecks.getState().sleeves, id)).toBeNull();
    expect(JSON.parse(localStorage.getItem('playmat.sleeves') ?? '{}')).toEqual({});

    const copyId = await useDecks.getState().duplicate(id);
    expect(useDecks.getState().sleeves[copyId]).toBeUndefined();
  });
});

describe('sharing and favorites', () => {
  test('sharing marks your own deck with your name; deck sync carries it', async () => {
    const id = await deckStorage.saveDeck(BURN, { forceNew: true });
    await useDecks.getState().refresh();
    await useDecks.getState().setShared([id, STARTER_PREFIX + STARTER.file], true, 'Ana');
    expect(await deckStorage.loadDeck(id)).toMatchObject({ shared: true, sharedBy: 'Ana', name: 'Burn' });
    expect(rosterOf(useDecks.getState()).find((deck) => deck.id === id)?.shared).toBe(true);
    await useDecks.getState().setShared([id], false, 'Ana');
    const unshared = await deckStorage.loadDeck(id);
    expect(unshared?.shared).toBeUndefined();
    expect(unshared?.sharedBy).toBeUndefined();
  });

  test("others' shared decks join the shelf, play as they are and copy as your own", async () => {
    vi.spyOn(api, 'deckSharedList').mockResolvedValue([
      { owner: 'bob', id: 'd1', name: 'Elves', updatedAt: 50, data: JSON.stringify({ ...BURN, name: 'Elves', shared: true, sharedBy: 'Bob' }) },
      { owner: 'cat', id: 'd2', name: 'Broken', updatedAt: 40, data: '{not json' },
    ]);
    await useDecks.getState().refreshShared();
    const id = `${SHARED_PREFIX}bob:d1`;
    const shared = rosterOf(useDecks.getState()).find((deck) => deck.id === id);
    expect(shared).toMatchObject({ name: 'Elves', sharedBy: 'Bob', kind: 'standard' });
    expect(shared?.note).toMatch(/^Shared by Bob/);
    expect(rosterOf(useDecks.getState())).toHaveLength(1);

    const { deck, id: playedId } = await useDecks.getState().loadForPlay(id);
    expect(playedId).toBe(id);
    expect(deck.cards[0].cardName).toBe('Lightning Bolt');
    expect(await deckStorage.listDecks()).toHaveLength(0);

    const copyId = await useDecks.getState().duplicate(id);
    const copy = await deckStorage.loadDeck(copyId);
    expect(copy?.name).toBe('Elves (copy)');
    expect(copy?.shared).toBeUndefined();
    expect(copy?.sharedBy).toBeUndefined();
  });

  test('a favorite is pinned to the top of the roster', async () => {
    const first = await deckStorage.saveDeck(BURN, { forceNew: true });
    const second = await deckStorage.saveDeck({ ...BURN, name: 'Zoo' }, { forceNew: true });
    await useDecks.getState().refresh();
    useDecks.getState().toggleFavorite(first);
    const roster = rosterOf(useDecks.getState());
    expect(roster[0]).toMatchObject({ id: first, favorite: true });
    expect(roster.find((deck) => deck.id === second)?.favorite).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('playmat.favoriteDecks') ?? '[]')).toEqual([first]);
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
