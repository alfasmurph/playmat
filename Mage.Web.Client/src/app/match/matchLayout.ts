import { MIN_TALL_HEIGHT, STAGE_HEIGHT, type StageContextValue } from './stageContext';

/** Where a player's two rows of permanents sit, and how big their cards may grow. */
export interface RowsPlacement {
  left: number;
  width: number;
  frontTop: number;
  backTop: number;
  /** ideal card widths: creatures (front) and lands and other permanents (back) */
  frontIdeal: number;
  backIdeal: number;
}

/**
 * The match's zones in stage pixels, for the stage's layout. Wide (a desktop, a tablet on its side): seats on the
 * left, a slim column on the right for the stack and the decision corner, the battlefield between. Tall (a tablet
 * held upright): both players' rows span the stage; the opponent's seat and piles are a band along the top, yours a
 * band above your hand at the bottom, and the stack sits between the two battlefields. The turn is printed around
 * the active seat's avatar in both.
 */
export interface MatchLayout {
  tall: boolean;
  /** the battlefield's horizontal span */
  fieldLeft: number;
  fieldWidth: number;
  /** wide: the column right of the battlefield (the stack, and the decision corner at its foot); 0 when tall */
  rightColumn: number;
  me: RowsPlacement;
  /** a single opponent's rows; several opponents share `fieldWidth` in columns */
  them: (index: number, count: number) => RowsPlacement;
  /** the line between the two halves of the table */
  seam: number;
  /** a hand card dragged above this line is played */
  playLine: number;
  /** your seat and piles (top-left corner) */
  myPlate: { left: number; top: number };
  myPiles: { left: number; top: number };
  /** the opponent's seat: index among `count` opponents */
  theirPlate: (index: number, count: number) => { left: number; top: number };
  theirPiles: { left: number; top: number };
  /** the centre of an opponent's hidden hand along the top edge */
  hiddenHandX: (index: number, count: number) => number;
  /** where a resolving stack object bursts (the top of the stack) */
  stackPoint: { x: number; y: number };
  /** tall: how much higher than usual the hand stands, so more of each card shows */
  handRaise: number;
}

/**
 * The wide layout's columns: seats on the left; on the right a slim column with the stack piled down it and the
 * decision corner at its foot. The corner's main button reaches left past the column, under your rows and right of
 * the hand.
 */
const FIELD_LEFT = 300;
const FIELD_RIGHT_MARGIN = 200;
/** multiplayer: each opponent's seat (plate, counters) in the left column, this far apart */
const SEAT_SPACING = 172;
/** an opponent's seat's top edge (a seat is about 120 tall: the avatar with the ring of turn steps around it) */
const SEAT_TOP = 24;
/** the centre of the stack's top object, in the right column */
const STACK_CENTER_Y = 250;

/** The tall layout: margins, the bands above and below the battlefield, and the rows between them. */
const TALL_MARGIN = 24;
const TALL_TOP_BAND = 215;
/** your seat, piles and decision corner, above the hand */
const TALL_BOTTOM_BAND = 180;
/** the hand's visible edge at the bottom of the stage */
const TALL_HAND = 130;
const TALL_ROW_GAP = 10;
const TALL_FRONT_IDEAL = 140;
const TALL_BACK_IDEAL = 104;
/** a taller window (a 16:10 tablet) shares its extra height between bigger rows and a higher hand */
const TALL_EXTRA_FRONT = 0.12;
const TALL_EXTRA_BACK = 0.09;
const TALL_EXTRA_HAND = 0.4;
const TALL_MAX_HAND_RAISE = 110;
const CARD_RATIO = 88 / 63;

const cache = new Map<string, MatchLayout>();

/**
 * The layout for a stage size. The same size gives the same objects (rows included), so memoized zones don't
 * re-render because the layout was worked out again.
 */
export function matchLayout(stage: Pick<StageContextValue, 'layout' | 'width' | 'height'>): MatchLayout {
  const key = `${stage.layout}:${stage.width}:${stage.height}`;
  let layout = cache.get(key);
  if (!layout) {
    if (cache.size > 16) cache.clear();
    layout = computeLayout(stage);
    const columns = new Map<string, RowsPlacement>();
    const them = layout.them;
    layout.them = (index, count) => {
      const column = `${index}/${count}`;
      let place = columns.get(column);
      if (!place) {
        place = them(index, count);
        columns.set(column, place);
      }
      return place;
    };
    cache.set(key, layout);
  }
  return layout;
}

function computeLayout(stage: Pick<StageContextValue, 'layout' | 'width' | 'height'>): MatchLayout {
  if (stage.layout === 'tall') return tallLayout(stage.width, stage.height);
  const fieldWidth = stage.width - FIELD_LEFT - FIELD_RIGHT_MARGIN;
  return {
    tall: false,
    fieldLeft: FIELD_LEFT,
    fieldWidth,
    rightColumn: FIELD_RIGHT_MARGIN,
    me: { left: FIELD_LEFT, width: fieldWidth, frontTop: 556, backTop: 778, frontIdeal: 150, backIdeal: 112 },
    them: (index, count) => {
      const width = fieldWidth / count;
      return {
        left: FIELD_LEFT + index * width,
        width: width - (count > 1 ? 24 : 0),
        frontTop: count === 1 ? 330 : 300,
        backTop: count === 1 ? 160 : 150,
        frontIdeal: 150,
        backIdeal: 112,
      };
    },
    seam: STAGE_HEIGHT / 2,
    playLine: STAGE_HEIGHT - 300,
    // the piles start level with your creatures: in Commander they stand two rows high (library, graveyard, exile,
    // commander) and must end above the seat, which sits at the bottom of the column with its extras beside it
    myPlate: { left: 24, top: 948 },
    myPiles: { left: 24, top: 556 },
    theirPlate: (index) => ({ left: 24, top: SEAT_TOP + index * SEAT_SPACING }),
    theirPiles: { left: 24, top: 152 },
    hiddenHandX: (index, count) => FIELD_LEFT + (index + 0.5) * (fieldWidth / count),
    stackPoint: { x: stage.width - FIELD_RIGHT_MARGIN / 2, y: STACK_CENTER_Y },
    handRaise: 0,
  };
}

function tallLayout(width: number, height: number): MatchLayout {
  const fieldLeft = TALL_MARGIN;
  const fieldWidth = width - 2 * TALL_MARGIN;
  const extra = Math.max(0, height - MIN_TALL_HEIGHT);
  const frontIdeal = Math.round(TALL_FRONT_IDEAL + extra * TALL_EXTRA_FRONT);
  const backIdeal = Math.round(TALL_BACK_IDEAL + extra * TALL_EXTRA_BACK);
  const handRaise = Math.round(Math.min(TALL_MAX_HAND_RAISE, extra * TALL_EXTRA_HAND));
  const frontHeight = frontIdeal * CARD_RATIO;
  const backHeight = backIdeal * CARD_RATIO;
  const bandTop = height - TALL_HAND - handRaise - TALL_BOTTOM_BAND;
  const myBack = bandTop - TALL_ROW_GAP - backHeight;
  const myFront = myBack - TALL_ROW_GAP - frontHeight;
  const theirBack = TALL_TOP_BAND;
  const theirFront = theirBack + backHeight + TALL_ROW_GAP;
  const seam = Math.round((theirFront + frontHeight + myFront) / 2);
  const column = (index: number, count: number) => fieldWidth / count * index;
  return {
    tall: true,
    fieldLeft,
    fieldWidth,
    rightColumn: 0,
    me: { left: fieldLeft, width: fieldWidth, frontTop: myFront, backTop: myBack, frontIdeal, backIdeal },
    them: (index, count) => ({
      left: fieldLeft + column(index, count),
      width: fieldWidth / count - (count > 1 ? 16 : 0),
      frontTop: theirFront,
      backTop: theirBack,
      frontIdeal,
      backIdeal,
    }),
    seam,
    playLine: bandTop,
    myPlate: { left: TALL_MARGIN, top: bandTop + 20 },
    myPiles: { left: 290, top: bandTop + 8 },
    theirPlate: (index, count) => ({ left: fieldLeft + column(index, count), top: SEAT_TOP }),
    theirPiles: { left: 290, top: 52 },
    hiddenHandX: (index, count) => (count === 1 ? width - 330 : fieldLeft + column(index + 1, count) - 120),
    stackPoint: { x: TALL_MARGIN + 95, y: seam - 168 },
    handRaise,
  };
}

/** How far each older object on the stack peeks out below the one above it, in stage pixels. */
const PEEK = 46;
const MIN_PEEK = 14;
/** the pile's height before the peeks close up: down the right column to above the decision corner */
const PILE_SPAN = 600;
/** the stack's cards in the wide column (StackZone.module.css) */
const STACK_CARD_HEIGHT = 152 * CARD_RATIO;

/** The peek for a stack of `count`: a long stack closes up so it stays in its column. */
export function stackPeek(count: number): number {
  if (count < 2) return PEEK;
  return Math.round(Math.min(PEEK, Math.max(MIN_PEEK, (PILE_SPAN - STACK_CARD_HEIGHT) / (count - 1))));
}
