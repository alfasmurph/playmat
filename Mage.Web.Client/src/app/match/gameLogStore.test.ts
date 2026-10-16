import { beforeEach, describe, expect, test } from 'vitest';
import { savedEntry } from '../../core/game/gameLog';
import { gameLogOf, MAX_LOG_LINES, useGameLog } from './gameLogStore';

const entry = (n: number) => savedEntry(`k${n}`, `line ${n}`, 'info');

beforeEach(() => useGameLog.setState({ byGame: {} }));

describe('game log store', () => {
  test('keeps each game\'s lines in order', () => {
    useGameLog.getState().add('a', entry(1));
    useGameLog.getState().add('b', entry(2));
    useGameLog.getState().add('a', entry(3));
    expect(gameLogOf('a')(useGameLog.getState()).map((line) => line.text)).toEqual(['line 1', 'line 3']);
    expect(gameLogOf('b')(useGameLog.getState())).toHaveLength(1);
  });

  test('an unknown game has the same empty list every time', () => {
    expect(gameLogOf('x')(useGameLog.getState())).toBe(gameLogOf('y')(useGameLog.getState()));
  });

  test('keeps the last lines of a long game', () => {
    for (let n = 0; n < MAX_LOG_LINES + 5; n++) useGameLog.getState().add('a', entry(n));
    const lines = gameLogOf('a')(useGameLog.getState());
    expect(lines).toHaveLength(MAX_LOG_LINES);
    expect(lines[0].text).toBe('line 5');
  });

  test('forgets the oldest games', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) useGameLog.getState().add(id, entry(1));
    expect(Object.keys(useGameLog.getState().byGame)).toEqual(['b', 'c', 'd', 'e']);
  });
});
