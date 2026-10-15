import { create } from 'zustand';
import type { DeckKind, RosterDeck } from './decks';
import { readJson, writeJson } from './persist';

export type ShelfSort = 'recent' | 'name';

/** Past this many decks a shelf gets a search field and a sort. */
export const SHELF_TOOLS_AFTER = 6;

const SHELF_KEY = 'playmat.playShelf';

interface SavedShelf {
  /** the shelf the player last chose; null until they choose one */
  kind: DeckKind | null;
  /** the deck last picked on each shelf */
  picks: Partial<Record<DeckKind, string>>;
  sort: ShelfSort;
}

interface ShelfState extends SavedShelf {
  setKind(kind: DeckKind): void;
  pick(kind: DeckKind, id: string): void;
  setSort(sort: ShelfSort): void;
}

function save(state: SavedShelf) {
  writeJson<SavedShelf>(SHELF_KEY, { kind: state.kind, picks: state.picks, sort: state.sort });
}

/** What this browser kept, with anything it doesn't recognize left out. */
function restore(): SavedShelf {
  const saved = readJson<Partial<SavedShelf> | null>(SHELF_KEY, null);
  return {
    kind: saved?.kind === 'commander' || saved?.kind === 'standard' ? saved.kind : null,
    picks: saved?.picks && typeof saved.picks === 'object' ? saved.picks : {},
    sort: saved?.sort === 'name' ? 'name' : 'recent',
  };
}

/** Play's two shelves (Commander and Standard), the deck picked on each, and how they are sorted; kept in this browser. */
export const useShelf = create<ShelfState>((set, get) => ({
  ...restore(),

  setKind(kind) {
    set({ kind });
    save(get());
  },

  pick(kind, id) {
    set({ picks: { ...get().picks, [kind]: id } });
    save(get());
  },

  setSort(sort) {
    set({ sort });
    save(get());
  },
}));

/** The shelf to show: the one last chosen here, else the selected deck's, else Commander. */
export function activeKind(chosen: DeckKind | null, roster: readonly RosterDeck[], selectedId: string | null): DeckKind {
  return chosen ?? roster.find((deck) => deck.id === selectedId)?.kind ?? 'commander';
}

export function shelfOf(roster: readonly RosterDeck[], kind: DeckKind): RosterDeck[] {
  return roster.filter((deck) => deck.kind === kind);
}

/**
 * The deck a shelf has picked: the selected deck when it is on this shelf (it may have been chosen on Decks, or be the
 * saved copy of a starter just played), else the one last picked here, else the most recent.
 */
export function pickOn(shelf: readonly RosterDeck[], picked: string | undefined, selectedId: string | null): RosterDeck | null {
  return shelf.find((deck) => deck.id === selectedId)
    ?? shelf.find((deck) => deck.id === picked)
    ?? arrange(shelf, '', 'recent')[0]
    ?? null;
}

/** Fold case and accents, so "lim" finds "Lim-Dûl". */
function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * A shelf as listed: the decks whose name or format has the query in it, favorites first, then the latest saved
 * first (starters, never saved, after them in their own order) or by name.
 */
export function arrange(shelf: readonly RosterDeck[], query: string, sort: ShelfSort): RosterDeck[] {
  const needle = folded(query.trim());
  const found = needle ? shelf.filter((deck) => folded(`${deck.name} ${deck.note}`).includes(needle)) : [...shelf];
  const sorted = sort === 'name'
    ? found.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
    // a stable sort keeps the starters in their listed order
    : found.sort((a, b) => (b.updatedAt ?? -1) - (a.updatedAt ?? -1));
  // favorites stay pinned at the top, in the same order
  return [...sorted.filter((deck) => deck.favorite), ...sorted.filter((deck) => !deck.favorite)];
}
