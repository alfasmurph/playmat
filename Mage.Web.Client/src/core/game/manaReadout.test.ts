import { describe, expect, it } from 'vitest';
import { describeManaReadout, manaReadout } from './manaReadout';

describe('manaReadout', () => {
  it('shows the total and each colour you could make', () => {
    const readout = manaReadout({ total: 9, white: 2, green: 3, colorless: 3, any: 1 });
    expect(readout).toEqual({
      total: 9,
      colors: [{ symbol: 'w', name: 'white', count: 2 }, { symbol: 'g', name: 'green', count: 3 }, { symbol: 'c', name: 'colorless', count: 3 }],
      any: 1,
    });
    expect(describeManaReadout(readout!)).toBe('9 mana you could make: up to 2 white, 3 green, 3 colorless and 1 of any colour');
  });

  it('shows nothing without mana', () => {
    expect(manaReadout(undefined)).toBeNull();
    expect(manaReadout({ total: 0 })).toBeNull();
  });
});
