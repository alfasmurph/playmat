// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { savedEntry } from '../../core/game/gameLog';
import type { GameSessionState } from '../../core/game/gameSession';
import { useGameRecords } from '../stores/gameRecords';
import { useGameLog } from './gameLogStore';
import { useGameRecord } from './useGameRecord';

const facts = { myName: 'Bob', opponents: ['Najeela'], deckName: 'Elves', vsAi: true };
const playing = { gameId: 'g1', mode: 'play', gameOver: null, endInfo: null, view: { turn: 9 } } as unknown as GameSessionState;
const over = { ...playing, gameOver: 'Player Bob is the winner' } as GameSessionState;

beforeEach(() => {
  useGameRecords.setState({ records: [] });
  useGameLog.setState({ byGame: {} });
  localStorage.clear();
});

describe('useGameRecord', () => {
  test('keeps nothing while the game is on', () => {
    renderHook(() => useGameRecord(playing, facts));
    expect(useGameRecords.getState().records).toEqual([]);
  });

  test('keeps the game once it ends, with its log, and again with a late line without doubling it', () => {
    useGameLog.getState().add('g1', savedEntry('a', 'Najeela lost the game due drawing from an empty library', 'lose'));
    const { rerender } = renderHook(({ state }) => useGameRecord(state, facts), { initialProps: { state: playing } });
    rerender({ state: over });
    rerender({ state: { ...over } });
    expect(useGameRecords.getState().records).toHaveLength(1);
    expect(useGameRecords.getState().records[0]).toMatchObject({
      gameId: 'g1', result: 'won', opponents: ['Najeela'], deckName: 'Elves', turns: 9, vsAi: true, reason: { kind: 'library', player: 'Najeela' },
    });
    useGameLog.getState().add('g1', savedEntry('b', 'Bob has won the game', 'win'));
    rerender({ state: over });
    const [record] = useGameRecords.getState().records;
    expect(useGameRecords.getState().records).toHaveLength(1);
    expect(record.log).toHaveLength(2);
  });

  test('keeps nothing when the result is unknown, or for a game being watched', () => {
    renderHook(() => useGameRecord({ ...over, gameOver: 'Game over' } as GameSessionState, facts));
    renderHook(() => useGameRecord({ ...over, mode: 'watch' } as GameSessionState, facts));
    expect(useGameRecords.getState().records).toEqual([]);
  });
});
