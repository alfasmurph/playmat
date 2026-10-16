import { useEffect, useRef } from 'react';
import { gameResult } from '../../core/game/matchResult';
import type { GameSessionState } from '../../core/game/gameSession';
import { gameLogOf, useGameLog } from './gameLogStore';
import { useGameRecords } from '../stores/gameRecords';

/** What the stage knows about the game that the record keeps beside the log. */
export interface GameRecordFacts {
  myName: string | null;
  opponents: string[];
  deckName: string | null;
  vsAi: boolean;
}

/**
 * Keeps a finished game in this browser's list of recent games, with its log. Saved when the game ends and again if
 * the end info or a last log line comes after (the same game replaces itself, so it counts once).
 */
export function useGameRecord(state: GameSessionState, facts: GameRecordFacts): void {
  const { gameId, gameOver, endInfo, mode } = state;
  const entries = useGameLog(gameLogOf(gameId));
  // read when the game ends, not a reason to save again
  const latest = useRef({ facts, turns: state.view?.turn ?? null });
  useEffect(() => {
    latest.current = { facts, turns: state.view?.turn ?? null };
  });
  useEffect(() => {
    if (mode !== 'play' || !gameOver) return;
    const { facts: known, turns } = latest.current;
    const result = gameResult(gameOver, endInfo, known.myName);
    if (!result) return;
    useGameRecords.getState().save({ gameId, result, entries, turns, ...known });
  }, [mode, gameId, gameOver, endInfo, entries]);
}
