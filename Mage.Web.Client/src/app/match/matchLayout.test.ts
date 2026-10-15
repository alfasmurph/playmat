import { describe, expect, test } from 'vitest';
import { matchLayout, stackPeek } from './matchLayout';
import { fitStage, MAX_TALL_HEIGHT, MIN_TALL_HEIGHT, STAGE_HEIGHT, STAGE_WIDTH, TALL_STAGE_WIDTH } from './stageContext';

const CARD_RATIO = 88 / 63;

describe('fitStage', () => {
  test('desktops and tablets on their side keep the wide stage', () => {
    expect(fitStage(1920, 1080)).toEqual({ layout: 'wide', width: STAGE_WIDTH, height: STAGE_HEIGHT, scale: 1 });
    expect(fitStage(1440, 900)).toMatchObject({ layout: 'wide', width: 1920, height: 1080 });
    const ipad = fitStage(1024, 768);
    expect(ipad).toMatchObject({ layout: 'wide', width: 1920 });
    expect(ipad.scale).toBeCloseTo(1024 / 1920);
    // an ultrawide widens the field
    expect(fitStage(2560, 1080).width).toBe(2560);
  });

  test('a tablet held upright gets the tall stage, as tall as its shape', () => {
    const ipad = fitStage(768, 1024);
    expect(ipad).toMatchObject({ layout: 'tall', width: TALL_STAGE_WIDTH, height: MIN_TALL_HEIGHT });
    expect(ipad.scale).toBeCloseTo(768 / 1080);
    expect(fitStage(820, 1180)).toMatchObject({ layout: 'tall', height: 1554 });
    expect(fitStage(800, 1280)).toMatchObject({ layout: 'tall', height: 1728 });
    // a phone's stage is as tall as its screen, so nothing is left blank above or below it
    const phone = fitStage(390, 844);
    expect(phone).toMatchObject({ layout: 'tall', height: 2337 });
    expect(phone.scale * phone.height).toBeCloseTo(844, 0);
    // a phone taller still is clamped: the stage stays whole on screen
    const narrow = fitStage(360, 900);
    expect(narrow.height).toBe(MAX_TALL_HEIGHT);
    expect(narrow.scale * MAX_TALL_HEIGHT).toBeLessThanOrEqual(900);
  });
});

describe('matchLayout', () => {
  test('wide: the field sits between the seat column and a slim column for the stack and decision corner', () => {
    const layout = matchLayout({ layout: 'wide', width: 1920, height: 1080 });
    expect(layout.tall).toBe(false);
    expect(layout.fieldLeft).toBe(300);
    expect(layout.rightColumn).toBe(200);
    expect(layout.fieldWidth).toBe(1920 - 300 - 200);
    expect(layout.seam).toBe(540);
    expect(layout.them(1, 2).left).toBeCloseTo(300 + 1420 / 2);
  });

  test.each([1920, 2280, 2640])('wide %i: the stack and the decision corner keep to the right column, clear of rows, hand and seats', (width) => {
    const layout = matchLayout({ layout: 'wide', width, height: 1080 });
    const fieldRight = layout.fieldLeft + layout.fieldWidth;
    expect(fieldRight).toBe(width - layout.rightColumn);
    // a resolving object bursts from the top of the stack, in the column
    expect(layout.stackPoint.x).toBeGreaterThan(fieldRight);
    expect(layout.stackPoint.x).toBeLessThan(width);
    for (let count = 1; count <= 3; count++) {
      for (let index = 0; index < count; index++) expect(layout.them(index, count).left + layout.them(index, count).width).toBeLessThanOrEqual(fieldRight);
    }
    // the corner's main row (chevron and button, 252 wide, 72 tall, 20 in from the corner) reaches past the column
    // only below your rows, and stays right of the widest hand (under 1168 wide, centred, fanned a little wider)
    const mainRow = { left: width - 20 - 252, top: 1080 - 20 - 72 };
    expect(mainRow.top).toBeGreaterThan(layout.me.backTop + layout.me.backIdeal * CARD_RATIO);
    expect(mainRow.left).toBeGreaterThan(width / 2 + 1168 / 2 + 40);
    // the corner's question and buttons keep to the column: its left edge is right of the rows
    expect(width - 20 - (layout.rightColumn - 36)).toBeGreaterThan(fieldRight);
  });

  test('wide: the seats (120 tall, with room for the ring of turn steps) fit their column', () => {
    const SEAT = 120;
    const layout = matchLayout({ layout: 'wide', width: 1920, height: 1080 });
    // yours under your piles (two rows of about 330), on the stage
    expect(layout.myPlate.top).toBeGreaterThan(layout.myPiles.top + 340);
    expect(layout.myPlate.top + SEAT).toBeLessThanOrEqual(1080 - 12);
    // one opponent: their piles under the seat; several: each seat and its counters (about 40) above the next
    expect(layout.theirPlate(0, 1).top + SEAT).toBeLessThan(layout.theirPiles.top);
    for (let index = 0; index < 2; index++) expect(layout.theirPlate(index, 3).top + SEAT + 40).toBeLessThan(layout.theirPlate(index + 1, 3).top);
    expect(layout.theirPlate(2, 3).top + SEAT + 40).toBeLessThan(layout.myPiles.top);
  });

  test.each([1440, 1554, 1728, 1920, 2337, 2400])('tall %i: top band, their rows, the turn, your rows, your piles, your seat, the hand, in that order', (height) => {
    const layout = matchLayout({ layout: 'tall', width: 1080, height });
    const them = layout.them(0, 1);
    const me = layout.me;
    expect(layout.fieldWidth).toBe(1080 - 48);
    expect(them.backTop).toBeGreaterThan(layout.theirPiles.top);
    expect(them.frontTop).toBeGreaterThanOrEqual(them.backTop + them.backIdeal * CARD_RATIO);
    // a band about 70 tall stays between the creature rows, at the seam (the stack's top card and reveals use it)
    expect(layout.seam - 35).toBeGreaterThan(them.frontTop + them.frontIdeal * CARD_RATIO);
    expect(layout.seam + 35).toBeLessThan(me.frontTop);
    expect(me.backTop).toBeGreaterThanOrEqual(me.frontTop + me.frontIdeal * CARD_RATIO);
    // the opponent's piles (about 191 tall, the commander's label included) end above their rows
    expect(layout.theirPiles.top + 191).toBeLessThanOrEqual(them.backTop);
    // the decision corner's main row (about 96 tall) stands at the seam, between the creature rows
    expect(layout.seam - 48).toBeGreaterThan(them.frontTop + them.frontIdeal * CARD_RATIO);
    expect(layout.seam + 48).toBeLessThan(me.frontTop);
    // your piles in their own row under your rows; your seat, a strip about 112 tall, between them and the hand
    expect(layout.myPiles.top).toBeGreaterThan(me.backTop + me.backIdeal * CARD_RATIO);
    expect(layout.myPiles.left).toBe(layout.myPlate.left);
    expect(layout.myPlate.top).toBeGreaterThanOrEqual(layout.myPiles.top + 191);
    expect(layout.myPlate.top + 112).toBeLessThanOrEqual(height - 130 - layout.handRaise);
    expect(layout.playLine).toBeLessThan(height - 118 - layout.handRaise);
    expect(layout.handRaise).toBeGreaterThanOrEqual(0);
  });

  test('the same size gives the same objects, so memoized rows keep their props', () => {
    const a = matchLayout({ layout: 'tall', width: 1080, height: 1554 });
    const b = matchLayout({ layout: 'tall', width: 1080, height: 1554 });
    expect(a).toBe(b);
    expect(a.them(0, 2)).toBe(b.them(0, 2));
    expect(a.them(0, 2)).not.toBe(a.them(1, 2));
  });
});

describe('stackPeek', () => {
  test('a short stack peeks fully; a long one closes up to stay in its column', () => {
    expect(stackPeek(1)).toBe(46);
    expect(stackPeek(2)).toBe(46);
    expect(stackPeek(9)).toBe(46);
    expect(stackPeek(12)).toBeLessThan(46);
    // the pile's bottom card ends above the decision corner however long the stack gets (until the peek floor)
    expect(11 * stackPeek(12) + 152 * CARD_RATIO).toBeLessThanOrEqual(600.5);
    expect(stackPeek(60)).toBe(14);
  });
});
