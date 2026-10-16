import { create } from 'zustand';
import { endReason, type EndReason, type LogEntry, type LogIcon } from '../../core/game/gameLog';
import type { GameResult } from '../../core/game/matchResult';
import { readJson, writeJson } from './persist';

const RECORDS_KEY = 'playmat.gameRecords';
export const MAX_RECORDS = 25;
export const MAX_LOG = 400;
/** a log line is a sentence; anything longer is noise */
const MAX_LINE = 300;

/** A log line kept as plain text with the icon it had. */
export type SavedLine = [icon: LogIcon, text: string];

/** How a game ended, as saved: the same as the log read it, without the line it came from. */
export type SavedReason = Omit<EndReason, 'key'>;

/** A finished game, kept in this browser. */
export interface GameRecord {
  gameId: string;
  endedAt: number;
  result: GameResult;
  reason: SavedReason | null;
  opponents: string[];
  deckName: string | null;
  turns: number | null;
  vsAi: boolean;
  log: SavedLine[];
}

/** What the match stage knows when a game ends. */
export interface GameEnd {
  gameId: string;
  result: GameResult;
  myName: string | null;
  opponents: string[];
  deckName?: string | null;
  turns?: number | null;
  vsAi?: boolean;
  entries: readonly LogEntry[];
  endedAt?: number;
}

interface GameRecordsState {
  /** newest first */
  records: GameRecord[];
  /** keeps a finished game; the same game saved again (its end info came later) replaces the first */
  save(end: GameEnd): void;
}

/** The game's lines as saved: game lines only (chat stays out), the last stretch of them. */
export function savedLog(entries: readonly LogEntry[]): SavedLine[] {
  return entries.filter((entry) => entry.tone === 'game').slice(-MAX_LOG).map((entry) => [entry.icon, entry.text.slice(0, MAX_LINE)]);
}

export function recordOf(end: GameEnd): GameRecord {
  const found = endReason(end.entries, end.myName);
  return {
    gameId: end.gameId,
    endedAt: end.endedAt ?? Date.now(),
    result: end.result,
    reason: found ? { kind: found.kind, player: found.player, mine: found.mine } : null,
    opponents: end.opponents,
    deckName: end.deckName ?? null,
    turns: end.turns ?? null,
    vsAi: !!end.vsAi,
    log: savedLog(end.entries),
  };
}

/** Records read back from storage, skipping anything that isn't one (an older shape, a hand-edited value). */
function load(): GameRecord[] {
  const saved = readJson<unknown>(RECORDS_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((item): item is GameRecord => !!item && typeof item.gameId === 'string' && typeof item.endedAt === 'number' && Array.isArray(item.log))
    .slice(0, MAX_RECORDS);
}

/** Ways to save less when storage is full, gentlest first: the oldest games lose their logs before the newest does. */
const SHRINKS: ((records: GameRecord[]) => GameRecord[])[] = [
  (records) => records,
  (records) => records.map((record, index) => (index < 5 ? record : { ...record, log: record.log.slice(-100) })),
  (records) => records.map((record, index) => (index < 2 ? record : { ...record, log: [] })),
  (records) => records.map((record, index) => (index < 1 ? { ...record, log: record.log.slice(-100) } : { ...record, log: [] })),
  (records) => records.map((record) => ({ ...record, log: [] })),
];

/** Writes the records, saving less each time storage refuses; returns what ended up kept (all of it in memory). */
function persist(records: GameRecord[]): GameRecord[] {
  for (const shrink of SHRINKS) {
    const attempt = shrink(records);
    if (writeJson(RECORDS_KEY, attempt)) return attempt;
  }
  // storage is unavailable: the records last for this visit
  return records;
}

export const useGameRecords = create<GameRecordsState>((set, get) => ({
  records: load(),
  save(end) {
    const before = get().records;
    const record = recordOf(end);
    const earlier = before.find((candidate) => candidate.gameId === record.gameId);
    // the same game again keeps the time it ended
    const next = [{ ...record, endedAt: earlier?.endedAt ?? record.endedAt }, ...before.filter((candidate) => candidate.gameId !== record.gameId)]
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, MAX_RECORDS);
    set({ records: persist(next) });
  },
}));
