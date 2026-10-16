import { create } from 'zustand';
import { estimateBracket, type Bracket, type BracketEstimate, type BracketLists } from '../../core/decks/bracket';
import { useDecks, type RosterDeck } from './decks';

/**
 * Commander bracket estimates for the decks on the shelf, worked out from their cards as they're shown and kept until
 * a deck changes. The lists they're judged by load once (public/data/brackets.json).
 */
interface BracketsState {
  lists: BracketLists | null;
  /** by deck id and the time it was saved, so a changed deck is judged again */
  estimates: Record<string, BracketEstimate>;
  ensure(decks: readonly RosterDeck[]): Promise<void>;
}

const pending = new Set<string>();
let listsLoading: Promise<BracketLists | null> | null = null;

function loadLists(): Promise<BracketLists | null> {
  listsLoading ??= fetch('/data/brackets.json')
    .then((response) => (response.ok ? (response.json() as Promise<BracketLists>) : null))
    .catch(() => null)
    .then((lists) => {
      if (!lists) listsLoading = null;
      return lists;
    });
  return listsLoading;
}

export const estimateKey = (deck: Pick<RosterDeck, 'id' | 'updatedAt'>) => `${deck.id}:${deck.updatedAt ?? 0}`;

export const useBrackets = create<BracketsState>((set, get) => ({
  lists: null,
  estimates: {},
  async ensure(decks) {
    const wanted = decks.filter((deck) => deck.kind === 'commander' && !get().estimates[estimateKey(deck)] && !pending.has(estimateKey(deck)));
    if (wanted.length === 0) return;
    for (const deck of wanted) pending.add(estimateKey(deck));
    const lists = get().lists ?? await loadLists();
    if (!lists) {
      for (const deck of wanted) pending.delete(estimateKey(deck));
      return;
    }
    if (!get().lists) set({ lists });
    const found: Record<string, BracketEstimate> = {};
    for (const deck of wanted) {
      const list = await useDecks.getState().loadList(deck.id).catch(() => null);
      if (list) found[estimateKey(deck)] = estimateBracket([...list.cards, ...list.sideboard].map((card) => card.cardName ?? ''), lists);
    }
    for (const deck of wanted) pending.delete(estimateKey(deck));
    set({ estimates: { ...get().estimates, ...found } });
  },
}));

/** A deck's bracket: the one its owner gave it, else its estimate (a precon's comes with it); null while unknown or not Commander. */
export function bracketOf(deck: RosterDeck, estimates: Record<string, BracketEstimate>, preconBracket?: number): { bracket: Bracket; set: boolean; estimate: BracketEstimate | null } | null {
  if (deck.kind !== 'commander') return null;
  const estimate = estimates[estimateKey(deck)] ?? null;
  if (deck.bracket && deck.bracket >= 1 && deck.bracket <= 5) return { bracket: deck.bracket as Bracket, set: true, estimate };
  if (estimate) return { bracket: estimate.bracket, set: false, estimate };
  return preconBracket ? { bracket: preconBracket as Bracket, set: false, estimate: null } : null;
}
