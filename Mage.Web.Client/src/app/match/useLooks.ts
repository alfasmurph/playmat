import { useState } from 'react';
import { NO_LOOKS, rememberLooks, type RevealGroup } from '../../core/game/reveals';
import type { GameView } from '../../protocol/generated/views';

/** Revealed and looked-at cards; looked-at cards come in one update only, so they're kept for the rest of the turn. */
export function useLooks(view: GameView | null): RevealGroup[] {
  const [looks, setLooks] = useState(() => ({ view, ...rememberLooks(NO_LOOKS, view) }));
  let current = looks;
  if (looks.view !== view) {
    current = { view, ...rememberLooks(looks.memory, view) };
    setLooks(current);
  }
  return current.groups;
}
