import { create } from 'zustand';
import { formatRules, isCommanderFormat } from '../../core/decks/formats';
import { deckStorage, type DeckSummary } from '../../core/decks/DeckStorageService';
import { DeckSerializer } from '../../core/decks/DeckSerializer';
import { copyName } from '../../core/decks/exportFormats';
import type { DeckCardLists, DeckImportSource } from '../../core/decks/types';
import type { SharedDeckEntry } from '../../protocol/generated/views';
import { api } from '../connection';
import { readJson, writeJson } from './persist';

export interface StarterDeck {
  file: string;
  name: string;
  cards: number;
  cover: { name: string; setCode: string; cardNumber: string };
  /** the deck type it is built for; Freeform when absent */
  format?: string;
}

/** A real Commander precon (public/precons, built by scripts/build-precons.mjs). */
export interface PreconDeck {
  /** its file under /precons, which makes its id ("precon:<file>") */
  file: string;
  name: string;
  cards: number;
  commanders: string[];
  cover: { name: string; setCode: string; cardNumber: string };
  /** what was changed to make it legal today (a card banned since swapped for a basic land) */
  changes?: string[];
}

/** A product line's precons, as released (the index is oldest first). */
export interface PreconSet {
  id: string;
  name: string;
  year: number;
  decks: PreconDeck[];
}

/** The two shelves of Play: commander decks, and every other (60-card) deck. */
export type DeckKind = 'commander' | 'standard';

/** A deck in the roster: one the player saved, or a starter deck not saved yet. */
export interface RosterDeck {
  id: string;
  name: string;
  note: string;
  cardCount: number;
  kind: DeckKind;
  /** when the player last saved it; starters have none */
  updatedAt?: number;
  cover: { name?: string; setCode: string; cardNumber: string } | null;
  colors: string[];
  starter: StarterDeck | null;
  /** a Commander precon being tried out: it's on the shelf while selected, and plays as printed */
  precon?: { set: string; year: number; changes?: string[] };
  /** a saved copy of a starter deck (it keeps the starter's name), made when the starter was first played */
  fromStarter?: boolean;
  /** the deck website it was imported from */
  source?: DeckImportSource;
  /** your deck, shared with everyone on the server */
  shared?: boolean;
  /** someone else's deck they share with everyone: who; it plays and copies, but only they change it */
  sharedBy?: string;
  /** pinned to the top of the shelf (this browser's choice) */
  favorite?: boolean;
}

const SELECTED_KEY = 'playmat.selectedDeck';
const SLEEVES_KEY = 'playmat.sleeves';
const FAVORITES_KEY = 'playmat.favoriteDecks';
const PLAYING_KEY = 'playmat.playingDeck';
export const STARTER_PREFIX = 'starter:';
/** a deck another player shares: "shared:<owner>:<deck id>" */
export const SHARED_PREFIX = 'shared:';
/** a Commander precon: "precon:<file under /precons>" */
export const PRECON_PREFIX = 'precon:';
const COMMANDER_FORMAT = 'Variant Magic - Commander';

const COLOR_ORDER = ['white', 'blue', 'black', 'red', 'green'] as const;
const COLOR_LETTER: Record<(typeof COLOR_ORDER)[number], string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };

/** Sleeve colors: matte dyes, picked to stay readable around card art. */
export const SLEEVE_COLORS = ['#20302b', '#1f2a44', '#3b1f2b', '#4a2a17', '#2c2c2e', '#3e3a2a', '#24403f', '#5a2320'];

/**
 * Which shelf a deck sits on. Its format decides; a deck with no format, or Freeform (which says nothing about its
 * shape), goes by its shape: one or two cards in the command zone and about a hundred in all is a commander deck.
 */
export function deckKind(deck: { format?: string | null; cards: number; sideboard: number }): DeckKind {
  if (isCommanderFormat(deck.format)) return 'commander';
  if (deck.format && !/Freeform/.test(deck.format)) return 'standard';
  const total = deck.cards + deck.sideboard;
  return deck.sideboard >= 1 && deck.sideboard <= 2 && total >= 98 && total <= 101 ? 'commander' : 'standard';
}

function summaryToRoster(deck: DeckSummary): RosterDeck {
  const colors = COLOR_ORDER.filter((color) => deck.colors?.[color]).map((color) => COLOR_LETTER[color]);
  const size = `${deck.cardCount ?? 0} cards${deck.sideboardCount ? ` + ${deck.sideboardCount}` : ''}`;
  return {
    id: deck.id,
    name: deck.name || 'Untitled deck',
    note: deck.format ? `${formatRules(deck.format).label} · ${size}` : size,
    cardCount: deck.cardCount ?? 0,
    kind: deckKind({ format: deck.format, cards: deck.cardCount ?? 0, sideboard: deck.sideboardCount ?? 0 }),
    updatedAt: deck.updatedAt,
    cover: deck.coverCard ?? null,
    colors,
    starter: null,
    source: deck.source,
    shared: deck.shared,
  };
}

/** Another player's shared deck, as a roster entry and the deck list to play; null when its data doesn't read. */
function sharedToRoster(entry: SharedDeckEntry): { roster: RosterDeck; list: DeckCardLists } | null {
  let deck: DeckCardLists;
  try {
    deck = JSON.parse(entry.data ?? '');
  } catch {
    return null;
  }
  if (!deck || !Array.isArray(deck.cards)) return null;
  const sideboard = Array.isArray(deck.sideboard) ? deck.sideboard : [];
  const id = `${SHARED_PREFIX}${entry.owner}:${entry.id}`;
  const by = (typeof deck.sharedBy === 'string' && deck.sharedBy.trim()) || entry.owner || 'someone';
  const summary = summaryToRoster({
    id,
    name: deck.name || entry.name || 'Untitled deck',
    format: deck.format,
    updatedAt: entry.updatedAt ?? 0,
    cardCount: deck.cards.reduce((sum, card) => sum + (card.amount ?? 0), 0),
    sideboardCount: sideboard.reduce((sum, card) => sum + (card.amount ?? 0), 0),
    coverCard: deck.coverCard,
    colors: deck.colors,
  });
  return {
    roster: { ...summary, note: `Shared by ${by} · ${summary.note}`, shared: true, sharedBy: by },
    list: { ...deck, sideboard, id: undefined, shared: undefined, sharedBy: undefined },
  };
}

function starterToRoster(starter: StarterDeck): RosterDeck {
  return {
    id: STARTER_PREFIX + starter.file,
    name: starter.name,
    note: `${isCommanderFormat(starter.format) ? 'Commander starter' : 'Starter deck'} · ${starter.cards} cards`,
    cardCount: starter.cards,
    kind: deckKind({ format: starter.format, cards: starter.cards, sideboard: 0 }),
    cover: starter.cover,
    colors: [],
    starter,
  };
}

export interface DeckLibraryState {
  saved: RosterDeck[];
  starters: StarterDeck[];
  /** the Commander precons, by set, oldest first; empty until loadPrecons */
  precons: PreconSet[];
  /** reads the precon index (once) */
  loadPrecons(): Promise<PreconSet[]>;
  /** decks other players share with everyone on the server, and their lists */
  shared: RosterDeck[];
  sharedLists: Record<string, DeckCardLists>;
  /** the decks pinned to the top of the shelf, in this browser */
  favorites: string[];
  selectedId: string | null;
  /** sleeves the player chose, by deck; a deck without one plays unsleeved (the chosen card back) */
  sleeves: Record<string, string>;
  /** the deck last sent to a game, so the match shows its sleeve whichever way the game started */
  playingId: string | null;
  loaded: boolean;
  refresh(): Promise<void>;
  /** the decks other players share (servers with accounts); quietly none when the server can't say */
  refreshShared(): Promise<void>;
  toggleFavorite(id: string): void;
  /** share your deck with everyone on the server, or stop; `by` is your account name as you spell it */
  setShared(ids: readonly string[], on: boolean, by: string): Promise<void>;
  select(id: string): void;
  /** sleeve a deck in a colour, or (null) take its sleeves off */
  setSleeve(id: string, color: string | null): void;
  /**
   * the deck list to send to the server; starter decks are saved to the library on first use. The deck becomes the
   * one in play unless `editing` (the builder opening a starter).
   */
  loadForPlay(id: string, options?: { editing?: boolean }): Promise<{ deck: DeckCardLists; id: string }>;
  /** a deck from the import sheet, saved as a new deck and selected */
  saveImported(deck: DeckCardLists): Promise<string>;
  /** a deck brought up to date with its site, under its own id */
  saveUpdated(deck: DeckCardLists): Promise<void>;
  remove(id: string): Promise<void>;
  /** a saved copy of a deck under a new name ("Burn (copy)"), with the same sleeve; selected, returns its id */
  duplicate(id: string): Promise<string>;
  rename(id: string, name: string): Promise<void>;
  /** the full deck list of a roster deck (saved or starter) without saving anything */
  loadList(id: string): Promise<DeckCardLists>;
}

async function fetchStarters(): Promise<StarterDeck[]> {
  try {
    const response = await fetch('/starter-decks/index.json');
    return response.ok ? ((await response.json()) as StarterDeck[]) : [];
  } catch {
    return [];
  }
}

/** The deck type a starter deck is built for. */
function starterFormat(starters: StarterDeck[], id: string): string {
  return starters.find((starter) => STARTER_PREFIX + starter.file === id)?.format ?? 'Constructed - Freeform';
}

export const useDecks = create<DeckLibraryState>((set, get) => ({
  saved: [],
  starters: [],
  selectedId: readJson<string | null>(SELECTED_KEY, null),
  precons: [],
  sleeves: readJson<Record<string, string>>(SLEEVES_KEY, {}),
  playingId: readJson<string | null>(PLAYING_KEY, null),
  shared: [],
  sharedLists: {},
  favorites: readJson<string[]>(FAVORITES_KEY, []),
  loaded: false,

  async refreshShared() {
    let entries: SharedDeckEntry[] = [];
    try {
      entries = await api.deckSharedList();
    } catch {
      entries = [];
    }
    const shared: RosterDeck[] = [];
    const sharedLists: Record<string, DeckCardLists> = {};
    for (const entry of entries) {
      const read = sharedToRoster(entry);
      if (!read) continue;
      shared.push(read.roster);
      sharedLists[read.roster.id] = read.list;
    }
    set({ shared, sharedLists });
  },

  toggleFavorite(id) {
    const current = get().favorites;
    const favorites = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
    writeJson(FAVORITES_KEY, favorites);
    set({ favorites });
  },

  async setShared(ids, on, by) {
    for (const id of ids) {
      if (id.startsWith(STARTER_PREFIX) || id.startsWith(SHARED_PREFIX)) continue;
      const deck = await deckStorage.loadDeck(id);
      if (!deck || !!deck.shared === on) continue;
      await deckStorage.saveDeck({ ...deck, id, shared: on || undefined, sharedBy: on ? by : undefined });
    }
    await get().refresh();
  },

  async loadPrecons() {
    if (get().precons.length) return get().precons;
    let precons: PreconSet[] = [];
    try {
      const response = await fetch('/precons/index.json');
      precons = response.ok ? ((await response.json()) as PreconSet[]) : [];
    } catch {
      precons = [];
    }
    set({ precons });
    return precons;
  },

  async refresh() {
    const [summaries, starters] = await Promise.all([deckStorage.listDecks(), get().starters.length ? get().starters : fetchStarters()]);
    const saved = summaries.map(summaryToRoster);
    let selectedId = get().selectedId;
    // a precon being tried out stays selected while it's still in the index
    if (selectedId?.startsWith(PRECON_PREFIX)) await get().loadPrecons();
    const known = new Set([
      ...saved.map((deck) => deck.id),
      ...get().shared.map((deck) => deck.id),
      ...starters.map((starter) => STARTER_PREFIX + starter.file),
      ...get().precons.flatMap((preconSet) => preconSet.decks.map((deck) => PRECON_PREFIX + deck.file)),
    ]);
    // a shared deck's list arrives just after: its selection waits for it
    if (!selectedId || (!known.has(selectedId) && !selectedId.startsWith(SHARED_PREFIX))) {
      selectedId = saved[0]?.id ?? (starters[0] ? STARTER_PREFIX + starters[0].file : null);
    }
    set({ saved, starters, selectedId, loaded: true });
    // others' shared decks come from the server, after your own are on the shelf
    void get().refreshShared();
  },

  select(id) {
    writeJson(SELECTED_KEY, id);
    set({ selectedId: id });
  },

  setSleeve(id, color) {
    const sleeves = { ...get().sleeves };
    if (color) sleeves[id] = color;
    else delete sleeves[id];
    writeJson(SLEEVES_KEY, sleeves);
    set({ sleeves });
  },

  async loadForPlay(id, { editing = false } = {}) {
    const playing = (loaded: { deck: DeckCardLists; id: string }) => {
      if (!editing) {
        writeJson(PLAYING_KEY, loaded.id);
        set({ playingId: loaded.id });
      }
      return loaded;
    };
    if (id.startsWith(STARTER_PREFIX)) {
      const deck = await get().loadList(id);
      deck.format = starterFormat(get().starters, id);
      const savedId = await deckStorage.saveDeck(deck, { forceNew: true });
      const sleeve = get().sleeves[id];
      await get().refresh();
      if (sleeve) get().setSleeve(savedId, sleeve);
      get().select(savedId);
      return playing({ deck, id: savedId });
    }
    if (id.startsWith(SHARED_PREFIX) || id.startsWith(PRECON_PREFIX)) {
      // someone else's deck plays as they last saved it, a precon as printed; nothing is copied
      return playing({ deck: await get().loadList(id), id });
    }
    const deck = await deckStorage.loadDeck(id);
    if (!deck) throw new Error('That deck is no longer saved.');
    return playing({ deck, id });
  },

  async saveImported(deck) {
    const id = await deckStorage.saveDeck({ ...deck, id: undefined }, { forceNew: true });
    await get().refresh();
    get().select(id);
    return id;
  },

  async saveUpdated(deck) {
    await deckStorage.saveDeck(deck);
    await get().refresh();
  },

  async remove(id) {
    await deckStorage.deleteDeck(id);
    await get().refresh();
  },

  async duplicate(id) {
    const deck = await get().loadList(id);
    const roster = rosterOf(get());
    const taken = roster.map((entry) => entry.name);
    // the copy wears the original's sleeves; an unsleeved deck's copy stays unsleeved
    const sleeve = get().sleeves[id] ?? null;
    const starter = id.startsWith(STARTER_PREFIX);
    // a precon's first copy keeps the precon's name: it's your deck now, and the precon leaves the shelf
    const preconName = id.startsWith(PRECON_PREFIX) && !get().saved.some((entry) => entry.name === deck.name);
    const name = preconName ? deck.name : copyName(deck.name, taken);
    // a copy is the player's own deck: it no longer follows the site it was imported from
    const copy: DeckCardLists = { ...deck, id: undefined, name, source: undefined, createdAt: undefined, shared: undefined, sharedBy: undefined };
    if (starter) copy.format = starterFormat(get().starters, id);
    if (id.startsWith(PRECON_PREFIX)) copy.format = COMMANDER_FORMAT;
    const newId = await deckStorage.saveDeck(copy, { forceNew: true });
    await get().refresh();
    if (sleeve) get().setSleeve(newId, sleeve);
    get().select(newId);
    return newId;
  },

  async rename(id, name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('A deck needs a name.');
    const deck = await deckStorage.loadDeck(id);
    if (!deck) throw new Error('That deck is no longer saved.');
    await deckStorage.saveDeck({ ...deck, id, name: trimmed });
    await get().refresh();
  },

  async loadList(id) {
    if (id.startsWith(SHARED_PREFIX)) {
      const list = get().sharedLists[id];
      if (!list) throw new Error('That deck is no longer shared.');
      return structuredClone(list);
    }
    if (id.startsWith(PRECON_PREFIX)) {
      const precon = findPrecon(get().precons, id);
      if (!precon) throw new Error('That precon is not available.');
      const response = await fetch(`/precons/${precon.deck.file.split('/').map(encodeURIComponent).join('/')}`);
      const text = response.ok ? await response.text() : '';
      if (!text || /^\s*</.test(text)) throw new Error(`Couldn't load ${precon.deck.name}.`);
      const deck = DeckSerializer.importDeck(text);
      return { ...deck, name: precon.deck.name, coverCard: precon.deck.cover, format: COMMANDER_FORMAT };
    }
    if (id.startsWith(STARTER_PREFIX)) {
      const starter = get().starters.find((candidate) => STARTER_PREFIX + candidate.file === id);
      if (!starter) throw new Error('That starter deck is not available.');
      const response = await fetch(`/starter-decks/${encodeURIComponent(starter.file)}`);
      const text = response.ok ? await response.text() : '';
      if (!text || /^\s*</.test(text)) throw new Error(`Couldn't load ${starter.name}.`);
      const deck = DeckSerializer.importDeck(text);
      return { ...deck, name: starter.name, coverCard: starter.cover, format: starter.format ?? 'Constructed - Freeform' };
    }
    const deck = await deckStorage.loadDeck(id);
    if (!deck) throw new Error('That deck is no longer saved.');
    return { ...deck, id };
  },
}));

/** A precon and its set, by id. */
export function findPrecon(precons: PreconSet[], id: string): { set: PreconSet; deck: PreconDeck } | null {
  for (const preconSet of precons) {
    const deck = preconSet.decks.find((candidate) => PRECON_PREFIX + candidate.file === id);
    if (deck) return { set: preconSet, deck };
  }
  return null;
}

export function preconToRoster(preconSet: PreconSet, deck: PreconDeck): RosterDeck {
  return {
    id: PRECON_PREFIX + deck.file,
    name: deck.name,
    note: `Precon · ${preconSet.name} · ${deck.cards} cards`,
    cardCount: deck.cards,
    kind: 'commander',
    cover: deck.cover,
    colors: [],
    starter: null,
    precon: { set: preconSet.name, year: preconSet.year, changes: deck.changes },
  };
}

export function rosterOf(state: Pick<DeckLibraryState, 'saved' | 'starters'> & Partial<Pick<DeckLibraryState, 'shared' | 'favorites' | 'precons' | 'selectedId'>>): RosterDeck[] {
  const savedNames = new Set(state.saved.map((deck) => deck.name));
  const starterNames = new Set(state.starters.map((starter) => starter.name));
  // starters already saved by the player don't show twice: the copy stands in for them, and says where it came from
  const saved = state.saved.map((deck) => (starterNames.has(deck.name) ? { ...deck, fromStarter: true } : deck));
  // a precon being tried out sits on the shelf while it's the selected deck
  const tried = state.selectedId?.startsWith(PRECON_PREFIX) ? findPrecon(state.precons ?? [], state.selectedId) : null;
  const all = [
    ...(tried ? [preconToRoster(tried.set, tried.deck)] : []),
    ...saved,
    ...(state.shared ?? []),
    ...state.starters.filter((starter) => !savedNames.has(starter.name)).map(starterToRoster),
  ];
  const favorites = new Set(state.favorites ?? []);
  if (favorites.size === 0) return all;
  // favorites first, each group in its own order
  const marked = all.map((deck) => (favorites.has(deck.id) ? { ...deck, favorite: true } : deck));
  return [...marked.filter((deck) => deck.favorite), ...marked.filter((deck) => !deck.favorite)];
}

/** The sleeves the player chose for a deck, or null for an unsleeved deck. */
export function chosenSleeve(sleeves: Record<string, string>, id: string | null | undefined): string | null {
  return (id && sleeves[id]) || null;
}

/** The colour a deck shows on the shelf: its sleeves, or a stable dye of its own when it has none. */
export function sleeveFor(sleeves: Record<string, string>, deck: RosterDeck | null | undefined): string {
  if (!deck) return SLEEVE_COLORS[0];
  if (sleeves[deck.id]) return sleeves[deck.id];
  // a stable default per deck
  let hash = 0;
  for (const char of deck.name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SLEEVE_COLORS[hash % SLEEVE_COLORS.length];
}
