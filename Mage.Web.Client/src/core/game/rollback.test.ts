import { describe, expect, it } from 'vitest';
import { previousTurnsBack } from './rollback';

describe('previousTurnsBack', () => {
  it('goes back to the last turn you were seen taking', () => {
    // a duel: your turns 3 and 5; on the opponent's turn 6, yours started one turn back
    expect(previousTurnsBack(6, false, [3, 5], 2)).toBe(1);
    // on your turn 7, the last one before it is 5
    expect(previousTurnsBack(7, true, [3, 5, 7], 2)).toBe(2);
  });
  it('knows a duel from the turn order before any turn was seen (after a reload)', () => {
    expect(previousTurnsBack(9, true, [], 2)).toBe(2);
    expect(previousTurnsBack(8, false, [], 2)).toBe(1);
  });
  it('gives up when it is unknown or further than the game keeps', () => {
    expect(previousTurnsBack(9, false, [], 4)).toBeNull();
    expect(previousTurnsBack(12, true, [3], 4)).toBeNull();
    expect(previousTurnsBack(1, true, [1], 2)).toBeNull();
  });
});
