import { createContext, useState } from 'react';
import type { CommanderStatus } from '../../core/game/commander';
import type { CardImageRef } from '../../core/images/imageLinks';
import type { PlayerView } from '../../protocol/generated/views';

/** The card whose art pictures each player at the table, by player id (see usePortraits). */
export const PortraitContext = createContext<ReadonlyMap<string, CardImageRef>>(new Map());

/**
 * The AI players' pictures: each one's commander, as soon as it is seen. It's kept for the whole game, so the picture
 * stays put while the commander is on the stack, in hand or in the library.
 */
export function usePortraits(players: readonly PlayerView[], commanders: ReadonlyMap<string, CommanderStatus[]>): ReadonlyMap<string, CardImageRef> {
  const [portraits, setPortraits] = useState<ReadonlyMap<string, CardImageRef>>(() => new Map());
  const found = players.flatMap((player) => {
    const id = player.playerId;
    const card = id && !player.isHuman && !portraits.has(id) ? commanders.get(id)?.[0]?.card : undefined;
    return id && card ? [[id, { name: card.name, expansionSetCode: card.expansionSetCode, cardNumber: card.cardNumber }] as const] : [];
  });
  // derived from what the board has shown so far: stored during render, as React allows for state from earlier renders
  if (found.length > 0) setPortraits(new Map([...portraits, ...found]));
  return portraits;
}
