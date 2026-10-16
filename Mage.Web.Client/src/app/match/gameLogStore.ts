import { create } from 'zustand';
import type { LogEntry } from '../../core/game/gameLog';

/** Lines kept per game: the drawer and the end screen read the same ones. */
export const MAX_LOG_LINES = 1000;
/** Games whose lines are kept: the one on screen, and a few just left (a rematch, a match's next game). */
const MAX_GAMES = 4;

interface GameLogState {
  /** every game's log lines, oldest first, by game id */
  byGame: Record<string, LogEntry[]>;
  add(gameId: string, entry: LogEntry): void;
}

/**
 * The game's running log, kept outside the drawer so it outlives it: the end screen shows what happened from the
 * same lines the drawer did. Replays bring their own log and don't write here.
 */
export const useGameLog = create<GameLogState>((set) => ({
  byGame: {},
  add(gameId, entry) {
    set((state) => {
      const next = { ...state.byGame, [gameId]: [...(state.byGame[gameId] ?? []), entry].slice(-MAX_LOG_LINES) };
      // objects keep insertion order: the oldest games go first
      const ids = Object.keys(next);
      for (const old of ids.slice(0, Math.max(0, ids.length - MAX_GAMES))) delete next[old];
      return { byGame: next };
    });
  },
}));

const NONE: LogEntry[] = [];

/** One game's lines (a stable empty list before any arrive). */
export const gameLogOf = (gameId: string) => (state: GameLogState): LogEntry[] => state.byGame[gameId] ?? NONE;
