import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { GameRecord } from '../stores/gameRecords';
import { RecentGames } from './RecentGames';

const record = (gameId: string, extra: Partial<GameRecord> = {}): GameRecord => ({
  gameId,
  endedAt: Date.UTC(2026, 9, 16, 12, 0),
  result: 'won',
  reason: { kind: 'library', player: 'Najeela', mine: false },
  opponents: ['Najeela'],
  deckName: 'Elves',
  turns: 7,
  vsAi: true,
  log: [
    ['turn', 'TURN 7 for Najeela'],
    ['draw', 'Najeela draws a card'],
    ['lose', 'Najeela lost the game due drawing from an empty library'],
  ],
  ...extra,
});

const show = (records: GameRecord[], replayIds: string[] = [], onReplay = vi.fn()) =>
  render(<RecentGames records={records} me="Bob" replayIds={new Set(replayIds)} onReplay={onReplay} />);

describe('RecentGames', () => {
  test('explains itself when no game has been kept', () => {
    show([]);
    expect(screen.getByRole('heading', { name: 'Your recent games' })).toBeTruthy();
    expect(screen.getByText(/remembered here/)).toBeTruthy();
  });

  test('lists each game with its result, opponents and reason', () => {
    show([record('g1'), record('g2', { result: 'lost', opponents: ['Ana', 'Cy'], reason: { kind: 'life', player: 'Bob', mine: true } })]);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Won');
    expect(rows[0].textContent).toContain('vs Najeela');
    expect(rows[0].textContent).toContain('Najeela drew from an empty library.');
    expect(rows[0].textContent).toContain('Elves');
    expect(rows[0].textContent).toContain('7 turns');
    expect(rows[1].textContent).toContain('Lost');
    expect(rows[1].textContent).toContain('vs Ana, Cy');
    expect(rows[1].textContent).toContain('Your life total reached 0.');
  });

  test('opens a game to its saved log, and closes it again', () => {
    show([record('g1')]);
    const toggle = screen.getByRole('button', { expanded: false });
    expect(screen.queryByText('Najeela draws a card')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const log = screen.getByRole('list', { name: /Log of the game/ });
    expect(within(log).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Turn 7 · Najeela',
      'Najeela draws a card',
      'Najeela lost the game due drawing from an empty library',
    ]);
    fireEvent.click(toggle);
    expect(screen.queryByText('Najeela draws a card')).toBeNull();
  });

  test('one game is open at a time', () => {
    show([record('g1'), record('g2')]);
    const [first, second] = screen.getAllByRole('button');
    fireEvent.click(first);
    fireEvent.click(second);
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(second.getAttribute('aria-expanded')).toBe('true');
  });

  test('offers the replay only while the server has it', () => {
    const onReplay = vi.fn();
    show([record('g1'), record('g2')], ['g2'], onReplay);
    const [first, second] = screen.getAllByRole('button');
    fireEvent.click(first);
    expect(screen.queryByRole('button', { name: 'Watch replay' })).toBeNull();
    fireEvent.click(second);
    fireEvent.click(screen.getByRole('button', { name: 'Watch replay' }));
    expect(onReplay).toHaveBeenCalledWith('g2');
  });

  test('says so when a game kept no log', () => {
    show([record('g1', { log: [] })]);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('No log was kept for this game.')).toBeTruthy();
  });
});
