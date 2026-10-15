import { describe, expect, test } from 'vitest';
import { CLASSIC_BACK, DEFAULT_CARD_BACK, cardBackImage, cardBackOf } from './cardBack';
import { sleeveOnBack } from './sleeveArt';

const GOLD = { color: '#7a5f1c', back: '/career-art/sleeve/gold.webp' };
const NAVY = { color: '#1f2a44', back: null };

describe('cardBackOf', () => {
  test('unsleeved decks show the real Magic back by default', () => {
    expect(DEFAULT_CARD_BACK).toBe('classic');
    expect(cardBackOf(null, { paintedArt: true, back: DEFAULT_CARD_BACK })).toEqual({ art: CLASSIC_BACK });
  });

  test('a sleeved deck shows its sleeve over any chosen back', () => {
    expect(cardBackOf(NAVY, { paintedArt: true, back: 'classic' })).toEqual({ dye: '#1f2a44' });
    expect(cardBackOf(GOLD, { paintedArt: true, back: 'classic' })).toEqual({ art: '/career-art/sleeve/gold.webp' });
  });

  test('painted art off: a Career sleeve shows its dye, a painted back falls back to the weave', () => {
    expect(cardBackOf(GOLD, { paintedArt: false, back: 'classic' })).toEqual({ dye: '#7a5f1c' });
    expect(cardBackOf(null, { paintedArt: false, back: 'classic' })).toEqual({ art: CLASSIC_BACK });
    expect(cardBackOf(null, { paintedArt: false, back: 'lantern' })).toBeNull();
  });

  test('the chosen painted back otherwise', () => {
    expect(cardBackOf(null, { paintedArt: true, back: 'orrery' })).toEqual({ art: '/card-back/orrery.webp' });
  });

  test('an unknown saved id shows a painted design', () => {
    expect(cardBackImage('gone' as never)).toBe('/card-back/stitch-hand.webp');
  });
});

describe('sleeveOnBack', () => {
  test('only the chosen sleeve covers backs; other rims leave the card back showing', () => {
    expect(sleeveOnBack('#1f2a44', '#1f2a44')).toEqual(NAVY);
    expect(sleeveOnBack('#1f2a44', null)).toBeNull();
    expect(sleeveOnBack('#3b1f2b', '#1f2a44')).toBeNull();
    expect(sleeveOnBack(undefined, '#1f2a44')).toBeNull();
  });

  test('a Career sleeve always shows its back', () => {
    expect(sleeveOnBack('#7a5f1c', null)).toEqual(GOLD);
  });
});
