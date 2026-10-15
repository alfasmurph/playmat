import { configuredImageProxy, proxiedScryfallUrl } from '../../core/images/imageProxy';

/**
 * Playmat's card backs (art/specs/cardback.json), one per design, in the order the picker shows them. They're painted
 * art, so with painted art off the printed CSS weave shows instead. Brown like a classic back, so a hidden card never
 * melts into the green cloth.
 */
export const CARD_BACKS = [
  'stitch-hand', 'stitched-rings', 'quiet', 'rosette', 'woven', 'sunburst', 'deck-stack', 'rings-five',
  'die-laurel', 'damask', 'world-tree', 'moon-peaks', 'labyrinth', 'orrery', 'knotwork', 'lantern',
] as const;

export type CardBackId = (typeof CARD_BACKS)[number] | 'classic';

/** Unsleeved decks show the real Magic back, like a deck on a kitchen table. */
export const DEFAULT_CARD_BACK: CardBackId = 'classic';

/** The painted design an unknown saved id falls back to. */
const FALLBACK_PAINTED = 'stitch-hand';

/** The original Magic card back as Scryfall serves it (its default card_back_id), through the image proxy if any. */
export const CLASSIC_BACK = proxiedScryfallUrl(
  'https://backs.scryfall.io/large/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg',
  configuredImageProxy(),
);

/** The picture of a card back choice (whatever the painted-art setting). */
export function cardBackImage(id: CardBackId): string {
  if (id === 'classic') return CLASSIC_BACK;
  return `/card-back/${(CARD_BACKS as readonly string[]).includes(id) ? id : FALLBACK_PAINTED}.webp`;
}

/** What a hidden card shows: a picture, the sleeve's own dye, or (null) the printed weave. */
export type BackLook = { art: string } | { dye: string } | null;

/**
 * The back of a hidden card. A sleeved deck shows its sleeve: a Career sleeve's painted back (painted art on), else
 * the sleeve's dye. An unsleeved deck shows the chosen back (the classic one always, a painted one only with painted
 * art on; null is the printed weave).
 */
export function cardBackOf(
  sleeve: { color: string; back: string | null } | null,
  { paintedArt, back }: { paintedArt: boolean; back: CardBackId },
): BackLook {
  if (sleeve) return paintedArt && sleeve.back ? { art: sleeve.back } : { dye: sleeve.color };
  if (back === 'classic') return { art: CLASSIC_BACK };
  return paintedArt ? { art: cardBackImage(back) } : null;
}
