import { deckKind, useDecks, PRECON_PREFIX } from './decks';
import type { DeckCardLists } from '../../core/decks/types';
import { isCommanderFormat } from '../../core/decks/formats';

function cardCount(cards: DeckCardLists['cards']): number {
  return cards.reduce((sum, card) => sum + card.amount, 0);
}

async function starterDeck(file: string, name: string): Promise<DeckCardLists> {
  const response = await fetch(`/starter-decks/${encodeURIComponent(file)}`);
  const text = response.ok ? await response.text() : '';
  if (!text || /^\s*</.test(text)) throw new Error(`Couldn't load the AI's deck (${name}).`);
  const { DeckSerializer } = await import('../../core/decks/DeckSerializer');
  const deck = DeckSerializer.importDeck(text);
  deck.name = name;
  return deck;
}

/**
 * Decks for the AI seats: the ones picked in the AI settings, seat by seat, and random starter decks of the same kind
 * (commander or not) for the others, never the same starter twice (nor the player's own deck) while there are others.
 * A picked deck of the other kind (or one no longer there) never sits at the table: its seat gets a random starter too.
 */
export async function aiDecks(chosenIds: readonly (string | null)[], count: number, commander: boolean, playerDeck?: string): Promise<DeckCardLists[]> {
  const library = useDecks.getState();
  if (chosenIds.some((id) => id?.startsWith(PRECON_PREFIX))) await library.loadPrecons();
  const picked = await Promise.all(Array.from({ length: count }, async (_, seat) => {
    const id = chosenIds[seat] ?? null;
    const deck = id ? await library.loadList(id).catch(() => null) : null;
    const kind = deck ? deckKind({ format: deck.format, cards: cardCount(deck.cards), sideboard: cardCount(deck.sideboard) }) : null;
    return deck && (kind === 'commander') === commander ? deck : null;
  }));
  const fitting = library.starters.filter((starter) => isCommanderFormat(starter.format) === commander);
  const pool = fitting.filter((starter) => starter.name !== playerDeck && !picked.some((deck) => deck?.name === starter.name));
  const decks: DeckCardLists[] = [];
  for (const deck of picked) {
    if (deck) {
      decks.push(deck);
      continue;
    }
    const candidates = pool.length > 0 ? pool : fitting;
    if (candidates.length === 0) throw new Error(commander ? 'No commander deck is available for the AI.' : 'No deck available for the AI.');
    const starter = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
    decks.push(await starterDeck(starter.file, starter.name));
  }
  return decks;
}

/**
 * An AI player's name at the table: its commander's (the part before the comma: "Ulalek", "Krenko"; partners joined
 * with "&"), or its deck's when it has none; a second one of the same name is numbered.
 */
export function botName(deck: { name?: string; sideboard?: { cardName?: string }[] }, commander: boolean, taken: readonly string[]): string {
  const commanders = commander ? (deck.sideboard ?? []).map((card) => (card.cardName ?? '').split(' // ')[0].split(',')[0].trim()).filter(Boolean) : [];
  const base = (commanders.length ? commanders.join(' & ') : deck.name?.trim() || 'AI').slice(0, 30);
  let name = base;
  for (let count = 2; taken.includes(name); count += 1) name = `${base} ${count}`;
  return name;
}

