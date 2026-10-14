// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest';
import type { DeckKind, RosterDeck } from './decks';
import { activeKind, arrange, pickOn, shelfOf, useShelf } from './shelf';

function deck(id: string, kind: DeckKind, updatedAt?: number, name = id, note = ''): RosterDeck {
  return { id, name, note, cardCount: kind === 'commander' ? 100 : 60, kind, updatedAt, cover: null, colors: [], starter: null };
}

const ROSTER = [
  deck('burn', 'standard', 300, 'Burn'),
  deck('atraxa', 'commander', 100, 'Atraxa'),
  deck('elves', 'standard', 500, 'Elves', 'Pauper · 60 cards + 15'),
  deck('limdul', 'commander', 400, 'Lim-Dûl the Necromancer'),
  deck('starter:krenko', 'commander', undefined, 'Krenko'),
  deck('starter:ajani', 'standard', undefined, 'Ajani'),
];

describe('Play shelves', () => {
  test('each shelf holds its own kind of deck, starters included', () => {
    expect(shelfOf(ROSTER, 'commander').map((entry) => entry.id)).toEqual(['atraxa', 'limdul', 'starter:krenko']);
    expect(shelfOf(ROSTER, 'standard').map((entry) => entry.id)).toEqual(['burn', 'elves', 'starter:ajani']);
  });

  test('the shelf on show: the one chosen here, else the selected deck\'s, else Commander', () => {
    expect(activeKind('standard', ROSTER, 'atraxa')).toBe('standard');
    expect(activeKind(null, ROSTER, 'burn')).toBe('standard');
    expect(activeKind(null, ROSTER, 'atraxa')).toBe('commander');
    expect(activeKind(null, ROSTER, null)).toBe('commander');
    expect(activeKind(null, [], 'gone')).toBe('commander');
  });

  test('a shelf picks the selected deck when it is there, else its last pick, else its most recent deck', () => {
    const commander = shelfOf(ROSTER, 'commander');
    expect(pickOn(commander, 'atraxa', 'limdul')?.id).toBe('limdul');
    // the selected deck is on the other shelf: switching back finds this shelf's last pick
    expect(pickOn(commander, 'atraxa', 'burn')?.id).toBe('atraxa');
    // the last pick is gone (a starter that was saved, a deleted deck): the most recently saved deck
    expect(pickOn(commander, 'starter:gone', 'burn')?.id).toBe('limdul');
    expect(pickOn(commander, undefined, null)?.id).toBe('limdul');
    expect(pickOn([], 'atraxa', 'atraxa')).toBeNull();
  });

  test('a shelf lists the latest saved first, starters after them, or by name', () => {
    expect(arrange(shelfOf(ROSTER, 'standard'), '', 'recent').map((entry) => entry.id)).toEqual(['elves', 'burn', 'starter:ajani']);
    expect(arrange(shelfOf(ROSTER, 'standard'), '', 'name').map((entry) => entry.name)).toEqual(['Ajani', 'Burn', 'Elves']);
  });

  test('search finds a name or a format by any part of it, ignoring case and accents', () => {
    expect(arrange(ROSTER, 'lim-dul', 'recent').map((entry) => entry.id)).toEqual(['limdul']);
    expect(arrange(ROSTER, 'pauper', 'recent').map((entry) => entry.id)).toEqual(['elves']);
    expect(arrange(ROSTER, '  KRE ', 'recent').map((entry) => entry.id)).toEqual(['starter:krenko']);
    expect(arrange(ROSTER, 'zzz', 'name')).toEqual([]);
  });
});

describe('the shelf this browser keeps', () => {
  test('the chosen shelf, each shelf\'s pick and the sort are kept for the next visit', async () => {
    localStorage.clear();
    useShelf.getState().setKind('standard');
    useShelf.getState().pick('standard', 'burn');
    useShelf.getState().pick('commander', 'atraxa');
    useShelf.getState().setSort('name');
    vi.resetModules();
    const { useShelf: reloaded } = await import('./shelf');
    expect(reloaded.getState()).toMatchObject({ kind: 'standard', picks: { standard: 'burn', commander: 'atraxa' }, sort: 'name' });
  });

  test('anything it doesn\'t recognize is left out', async () => {
    localStorage.setItem('playmat.playShelf', JSON.stringify({ kind: 'vintage', picks: 'x', sort: 'colour' }));
    vi.resetModules();
    const { useShelf: reloaded } = await import('./shelf');
    expect(reloaded.getState()).toMatchObject({ kind: null, picks: {}, sort: 'recent' });
  });
});
