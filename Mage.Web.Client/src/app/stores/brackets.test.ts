import { describe, expect, test } from 'vitest';
import type { BracketEstimate } from '../../core/decks/bracket';
import { bracketOf, estimateKey } from './brackets';
import type { RosterDeck } from './decks';

const deck = (patch: Partial<RosterDeck> = {}): RosterDeck => ({
  id: 'd1', name: 'Atraxa', note: '', cardCount: 100, kind: 'commander', updatedAt: 5, cover: null, colors: [], starter: null, ...patch,
});
const ESTIMATE: BracketEstimate = { bracket: 4, gameChangers: ['Mana Vault', 'Mox Diamond', 'Chrome Mox', 'Ancient Tomb'], massLandDenial: [], extraTurns: [] };

describe('bracketOf', () => {
  test('the bracket the owner set wins over the estimate', () => {
    const estimates = { [estimateKey(deck())]: ESTIMATE };
    expect(bracketOf(deck({ bracket: 5 }), estimates)).toEqual({ bracket: 5, set: true, estimate: ESTIMATE });
    expect(bracketOf(deck(), estimates)).toEqual({ bracket: 4, set: false, estimate: ESTIMATE });
  });

  test('a changed deck waits for a new estimate; a precon brings its own; other decks have none', () => {
    const estimates = { [estimateKey(deck())]: ESTIMATE };
    expect(bracketOf(deck({ updatedAt: 6 }), estimates)).toBeNull();
    expect(bracketOf(deck({ id: 'precon:x', updatedAt: undefined }), {}, 2)).toEqual({ bracket: 2, set: false, estimate: null });
    expect(bracketOf(deck({ kind: 'standard' }), estimates)).toBeNull();
  });
});
