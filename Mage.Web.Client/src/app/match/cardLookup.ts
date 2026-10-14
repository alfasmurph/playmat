import type { CardView, GameView } from '../../protocol/generated/views';

/** Every card the table shows, by id: battlefield, hands, stack, graveyards, exile, command zones and revealed cards. */
export function findCard(view: GameView | null, id: string, extra: readonly CardView[]): CardView | null {
  if (!view) return extra.find((card) => card.id === id) ?? null;
  const pools: ({ [key: string]: CardView } | undefined)[] = [view.myHand, view.stack];
  for (const player of view.players ?? []) pools.push(player.battlefield, player.graveyard, player.exile);
  for (const zone of view.exiles ?? []) pools.push(zone);
  for (const zone of [...(view.revealed ?? []), ...(view.lookedAt ?? [])]) pools.push(zone.cards);
  for (const pool of pools) {
    const card = pool?.[id];
    if (card) return card;
  }
  // a commander waiting in the command zone (the zone is a list, not keyed by id)
  for (const player of view.players ?? []) {
    const card = ((player.commandList ?? []) as CardView[]).find((candidate) => candidate.id === id);
    if (card) return card;
  }
  return extra.find((card) => card.id === id) ?? null;
}

/** "Legendary Creature — Elf Druid", from the card's types. */
export function typeLine(card: CardView): string {
  const words = (list: readonly string[] | undefined) => (list ?? []).map((word) => word.charAt(0) + word.slice(1).toLowerCase().replace(/_/g, ' '));
  const left = [...words(card.superTypes), ...words(card.cardTypes)].join(' ');
  const right = words(card.subTypes as string[] | undefined).join(' ');
  return right ? `${left} — ${right}` : left;
}
