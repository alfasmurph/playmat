/** The engine keeps this many turns to go back to (GameImpl.ROLLBACK_TURNS_MAX). */
export const ROLLBACK_TURNS_MAX = 4;

/**
 * How many turns back your previous turn started: from the turns you were seen taking, or in a duel from the turn
 * order. Null when it isn't known or the game can no longer go that far.
 */
export function previousTurnsBack(turn: number, myTurn: boolean, seen: readonly number[], players: number): number | null {
  const earlier = seen.filter((number) => number < turn);
  const previous = earlier.length ? Math.max(...earlier) : players === 2 ? turn - (myTurn ? 2 : 1) : null;
  if (previous === null || previous < 1) return null;
  const back = turn - previous;
  return back >= 1 && back <= ROLLBACK_TURNS_MAX ? back : null;
}
