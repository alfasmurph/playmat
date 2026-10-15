import type { CardView, GameView } from '../../protocol/generated/views';

/**
 * Cards revealed to everyone, and cards only this player looked at, as the server lists them in the game view. The
 * server keeps revealed cards until the end of the turn, named after what revealed them ("Duress [1a2] [3]"), but
 * sends looked-at cards in one update only (see rememberLooks).
 */
export interface RevealGroup {
  /** stable while the same cards stay revealed by the same source */
  key: string;
  kind: 'revealed' | 'lookedAt';
  title: string;
  /** the server's name for the group, ids included */
  source: string;
  /** whose cards they are (the owner of the first card), when known */
  ownerId: string | null;
  cards: CardView[];
}

/** "Duress [1a2] [3]" -> "Duress": object ids and zone counters mean nothing to the player. */
export function cleanRevealTitle(name: string | undefined): string {
  return (name ?? '').replace(/<[^>]*>/g, '').replace(/\s*\[[0-9a-f]{3}\]/gi, '').replace(/\s*\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
}

/** Every full card view in the game, by id: looked-at cards only carry their printing, the rest is found here. */
function knownCards(view: GameView): Map<string, CardView> {
  const known = new Map<string, CardView>();
  const add = (cards: Record<string, CardView> | undefined) => {
    for (const [id, card] of Object.entries(cards ?? {})) known.set(card.id ?? id, card);
  };
  add(view.myHand);
  add(view.stack);
  for (const player of view.players ?? []) {
    add(player.graveyard);
    add(player.exile);
    add(player.battlefield);
  }
  for (const revealed of view.revealed ?? []) add(revealed.cards);
  return known;
}

export function revealGroups(view: GameView | null | undefined): RevealGroup[] {
  if (!view) return [];
  const known = knownCards(view);
  const groups: RevealGroup[] = [];
  for (const revealed of view.revealed ?? []) {
    const cards = Object.entries(revealed.cards ?? {}).map(([id, card]) => ({ ...card, id: card.id ?? id }));
    if (cards.length === 0) continue;
    groups.push({
      key: `revealed|${revealed.name ?? ''}|${cards.map((card) => card.id).join(',')}`,
      kind: 'revealed',
      title: cleanRevealTitle(revealed.name),
      source: revealed.name ?? '',
      ownerId: cards[0].ownerId ?? null,
      cards,
    });
  }
  for (const looked of view.lookedAt ?? []) {
    const cards = Object.entries(looked.cards ?? {}).map(([id, simple]): CardView => {
      const cardId = simple.id ?? id;
      return known.get(cardId) ?? { id: cardId, expansionSetCode: simple.expansionSetCode, cardNumber: simple.cardNumber, usesVariousArt: simple.usesVariousArt };
    });
    if (cards.length === 0) continue;
    groups.push({
      key: `lookedAt|${looked.name ?? ''}|${cards.map((card) => card.id).join(',')}`,
      kind: 'lookedAt',
      title: cleanRevealTitle(looked.name),
      source: looked.name ?? '',
      ownerId: cards[0].ownerId ?? null,
      cards,
    });
  }
  return groups;
}

/** Looked-at cards carried over from earlier updates of the same turn. */
export interface LookMemory {
  turn: number | null;
  groups: RevealGroup[];
}

export const NO_LOOKS: LookMemory = { turn: null, groups: [] };

/**
 * revealGroups, plus the cards this player looked at earlier this turn. The server clears looked-at cards right after
 * the update that shows them, so without this "you may look at the top card of your library any time" (Mystic Forge)
 * would flash and vanish. A newer group with the same name replaces an older one (the new top card), and a card
 * that has since turned up in a public zone or the hand (drawn, cast, milled) is dropped from what was looked at.
 */
export function rememberLooks(memory: LookMemory, view: GameView | null | undefined): { groups: RevealGroup[]; memory: LookMemory } {
  if (!view) return { groups: [], memory: NO_LOOKS };
  const current = revealGroups(view);
  const turn = view.turn ?? null;
  const known = knownCards(view);
  const fresh = current.filter((group) => group.kind === 'lookedAt');
  const carried = memory.turn !== turn ? [] : memory.groups
    .filter((group) => !fresh.some((other) => other.source === group.source))
    .map((group) => ({ ...group, cards: group.cards.filter((card) => !card.id || !known.has(card.id)) }))
    .filter((group) => group.cards.length > 0);
  return { groups: [...carried, ...current], memory: { turn, groups: [...carried, ...fresh] } };
}

/** The server's name for the top card of the library, when an effect lets its owner look at it (Mystic Forge). */
export const LIBRARY_TOP = 'Top card of your library';

const isLibraryTop = (group: RevealGroup) => group.kind === 'lookedAt' && group.cards.length === 1 && cleanRevealTitle(group.source) === LIBRARY_TOP;

/** The top card of this player's library, when an effect lets them look at it any time: the newest such look. */
export function libraryTopLook(groups: readonly RevealGroup[]): CardView | null {
  for (let index = groups.length - 1; index >= 0; index--) {
    if (isLibraryTop(groups[index])) return groups[index].cards[0];
  }
  return null;
}

/** The groups without the library's top card, which shows on the library itself. */
export function withoutLibraryTop(groups: readonly RevealGroup[]): RevealGroup[] {
  return groups.filter((group) => !isLibraryTop(group));
}

/** Short label for a group: "Revealed: Duress", "Looked at: Opt". */
export function revealLabel(group: RevealGroup): string {
  const verb = group.kind === 'revealed' ? 'Revealed' : 'Looked at';
  return group.title ? `${verb}: ${group.title}` : verb;
}

/**
 * Which seat a group is shown at: its owner's when that player is at the table, otherwise the viewer's own (cards
 * looked at come without an owner, and only this player saw them).
 */
export function revealSeat(group: RevealGroup, seats: ReadonlySet<string>, myPlayerId: string | null): string | null {
  if (group.ownerId && seats.has(group.ownerId)) return group.ownerId;
  return myPlayerId;
}

/**
 * The cards a yes/no question is about, when an effect looked at or revealed them just before asking ("look at the
 * top five cards; you may put a land..."): the server names the source in the question (options.secondMessage,
 * "Elvish Rejuvenator [1a2]") and in the looked-at window ("Elvish Rejuvenator [1a2] [3]"). The newest such group,
 * or null.
 */
export function askedAboutCards(prompt: { kind: string; options: Record<string, unknown> } | null | undefined, view: GameView | null | undefined): RevealGroup | null {
  if (prompt?.kind !== 'ask' || !view) return null;
  const source = typeof prompt.options.secondMessage === 'string' ? prompt.options.secondMessage.replace(/<[^>]*>/g, '') : '';
  const objectId = /\[([0-9a-f]{3})\]/i.exec(source)?.[1]?.toLowerCase();
  if (!objectId) return null;
  const matching = revealGroups(view).filter((group) => group.source.toLowerCase().includes(`[${objectId}]`));
  return matching[matching.length - 1] ?? null;
}
