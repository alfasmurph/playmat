// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { savedEntry, type LogEntry } from '../../core/game/gameLog';

const KEY = 'playmat.gameRecords';

async function load() {
  return import('./gameRecords');
}

const lines = (...texts: string[]): LogEntry[] => texts.map((text, index) => savedEntry(`k${index}`, text, 'info'));

const end = (gameId: string, extra: Record<string, unknown> = {}) => ({
  gameId,
  result: 'won' as const,
  myName: 'Bob',
  opponents: ['Najeela'],
  entries: lines('TURN 1 for Bob', 'Najeela lost the game due drawing from an empty library'),
  ...extra,
});

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('game records', () => {
  test('keeps a finished game with its reason, opponents and log, and stores it', async () => {
    const { useGameRecords } = await load();
    useGameRecords.getState().save(end('g1', { deckName: 'Elves', turns: 7, vsAi: true }));
    const [record] = useGameRecords.getState().records;
    expect(record).toMatchObject({
      gameId: 'g1',
      result: 'won',
      reason: { kind: 'library', player: 'Najeela', mine: false },
      opponents: ['Najeela'],
      deckName: 'Elves',
      turns: 7,
      vsAi: true,
    });
    expect(record.log).toEqual([['info', 'TURN 1 for Bob'], ['info', 'Najeela lost the game due drawing from an empty library']]);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toHaveLength(1);
  });

  test('leaves chat out of the log', async () => {
    const { useGameRecords } = await load();
    const chat: LogEntry = { ...savedEntry('c', 'gg', 'chat'), tone: 'chat', who: 'Najeela' };
    useGameRecords.getState().save(end('g1', { entries: [...lines('Bob plays Mountain'), chat] }));
    expect(useGameRecords.getState().records[0].log).toEqual([['info', 'Bob plays Mountain']]);
  });

  test('a game saved twice counts once, keeps the time it ended, and takes the newer facts', async () => {
    const { useGameRecords } = await load();
    useGameRecords.getState().save(end('g1', { endedAt: 1000, result: 'lost' }));
    useGameRecords.getState().save(end('g2', { endedAt: 2000 }));
    useGameRecords.getState().save(end('g1', { endedAt: 5000, result: 'won' }));
    const records = useGameRecords.getState().records;
    expect(records.map((record) => record.gameId)).toEqual(['g2', 'g1']);
    expect(records[1]).toMatchObject({ result: 'won', endedAt: 1000 });
  });

  test('lists newest first and keeps 25', async () => {
    const { useGameRecords, MAX_RECORDS } = await load();
    for (let n = 1; n <= 30; n++) useGameRecords.getState().save(end(`g${n}`, { endedAt: n * 1000 }));
    const records = useGameRecords.getState().records;
    expect(MAX_RECORDS).toBe(25);
    expect(records).toHaveLength(25);
    expect(records[0].gameId).toBe('g30');
    expect(records.at(-1)?.gameId).toBe('g6');
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toHaveLength(25);
  });

  test('keeps the last 400 lines, each cut to a sentence', async () => {
    const { useGameRecords } = await load();
    const entries = lines(...Array.from({ length: 450 }, (_, n) => `line ${n}`), 'x'.repeat(1000));
    useGameRecords.getState().save(end('g1', { entries }));
    const { log } = useGameRecords.getState().records[0];
    expect(log).toHaveLength(400);
    expect(log[0][1]).toBe('line 51');
    expect(log.at(-1)?.[1]).toHaveLength(300);
  });

  test('reads back what an earlier visit stored, and skips what is not a record', async () => {
    localStorage.setItem(KEY, JSON.stringify([{ gameId: 'old', endedAt: 1, result: 'lost', log: [], opponents: [] }, { nope: true }, 7]));
    const { useGameRecords } = await load();
    expect(useGameRecords.getState().records.map((record) => record.gameId)).toEqual(['old']);
  });

  test('starts empty from a damaged value', async () => {
    localStorage.setItem(KEY, '{not json');
    const { useGameRecords } = await load();
    expect(useGameRecords.getState().records).toEqual([]);
  });

  test('when storage is full, older games give up their logs before the newest does', async () => {
    const { useGameRecords } = await load();
    for (let n = 1; n <= 8; n++) useGameRecords.getState().save(end(`g${n}`, { endedAt: n * 1000 }));
    // refuse any write that still carries the oldest games' logs
    const real = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if ((JSON.parse(value) as { log: unknown[] }[]).filter((record) => record.log.length > 0).length > 2) throw new DOMException('full', 'QuotaExceededError');
      real(key, value);
    });
    useGameRecords.getState().save(end('g9', { endedAt: 9000 }));
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as { gameId: string; log: unknown[] }[];
    expect(stored[0].gameId).toBe('g9');
    expect(stored[0].log.length).toBeGreaterThan(0);
    expect(stored.slice(2).every((record) => record.log.length === 0)).toBe(true);
    // the list itself is whole
    expect(useGameRecords.getState().records).toHaveLength(9);
  });

  test('never throws when storage refuses everything; the games last for this visit', async () => {
    const { useGameRecords } = await load();
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => useGameRecords.getState().save(end('g1'))).not.toThrow();
    expect(useGameRecords.getState().records).toHaveLength(1);
    expect(useGameRecords.getState().records[0].log).toHaveLength(2);
  });
});
