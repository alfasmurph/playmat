import { describe, expect, test } from 'vitest';
import { bracketReasons, estimateBracket, type BracketLists } from './bracket';

const LISTS: BracketLists = {
  gameChangers: ['Cyclonic Rift', 'Rhystic Study', 'Smothering Tithe', 'Demonic Tutor', "Tergrid, God of Fright // Tergrid's Lantern"],
  massLandDenial: ['Armageddon'],
  extraTurns: ['Time Warp', 'Temporal Manipulation', 'Capture of Jingzhou'],
};

describe('estimateBracket', () => {
  test('a deck with nothing on the lists is Core', () => {
    expect(estimateBracket(['Forest', 'Llanowar Elves'], LISTS).bracket).toBe(2);
    expect(estimateBracket(['Time Warp'], LISTS).bracket).toBe(2);
  });

  test('one to three Game Changers, or two extra turns, is Upgraded', () => {
    expect(estimateBracket(['Cyclonic Rift', 'Forest'], LISTS)).toMatchObject({ bracket: 3, gameChangers: ['Cyclonic Rift'] });
    expect(estimateBracket(['Time Warp', 'Temporal Manipulation'], LISTS).bracket).toBe(3);
  });

  test('four Game Changers, mass land denial or three extra turns is Optimized', () => {
    expect(estimateBracket(['Cyclonic Rift', 'Rhystic Study', 'Smothering Tithe', 'Demonic Tutor'], LISTS).bracket).toBe(4);
    expect(estimateBracket(['Armageddon'], LISTS).bracket).toBe(4);
    expect(estimateBracket(['Time Warp', 'Temporal Manipulation', 'Capture of Jingzhou'], LISTS).bracket).toBe(4);
  });

  test('names match whatever their case, and a double-faced card by its front face; copies count once', () => {
    const estimate = estimateBracket(['tergrid, god of fright', 'Cyclonic Rift', 'Cyclonic Rift'], LISTS);
    expect(estimate.gameChangers).toEqual(['Cyclonic Rift', "Tergrid, God of Fright // Tergrid's Lantern"]);
    expect(bracketReasons(estimate)).toEqual(["2 Game Changers: Cyclonic Rift, Tergrid, God of Fright // Tergrid's Lantern"]);
  });
});
