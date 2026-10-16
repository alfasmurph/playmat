import type { CardType, CardView, PermanentView } from '../../protocol/generated/views';
import type { Command } from './interaction';
import { stripMarkup, type Prompt } from './prompt';

/**
 * Automatic mana payment, decided on the client: the server asks for mana one source at a time and has no
 * auto-tap for human players. The plan only taps sources whose mana it can read, and only when the whole remaining
 * cost can be covered without tapping something the player would rather keep (a Mana Vault for one generic mana,
 * a Mishra's Workshop for a creature); anything else is left to the player.
 */

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

export interface ManaSource {
  id: string;
  /** the colors one activation can add: one for most sources, several when the player picks (duals, "any color") */
  colors: ManaColor[];
  /** how much mana one activation adds: {C}{C}{C} is 3 */
  amount: number;
  isLand: boolean;
  /** a basic land: the first thing to spend on generic mana */
  basic: boolean;
  /** "Spend this mana only to ...": listed only once the cost being paid is known to qualify (see canSpend) */
  restricted: boolean;
  /** doesn't untap during its controller's untap step (Mana Vault) */
  noUntap: boolean;
  /** using it costs more than tapping it: life, damage, mana, a sacrifice */
  costly: boolean;
}

/** A permanent's mana as read from its card, before the cost being paid is known. */
export interface ManaReading extends Omit<ManaSource, 'id'> {
  /** the restriction's own text ("Spend this mana only to cast artifact spells."), for canSpend */
  restriction: string | null;
}

export interface ManaCostParts {
  generic: number;
  colored: Partial<Record<ManaColor, number>>;
}

const COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];
const ANY_COLOR: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];
const BASIC_TYPES: Record<string, ManaColor> = { PLAINS: 'W', ISLAND: 'U', SWAMP: 'B', MOUNTAIN: 'R', FOREST: 'G' };
const BASIC_NAMES = /^(?:snow-covered )?(?:plains|island|swamp|mountain|forest|wastes)$/i;
const COLOR_NAMES: Record<ManaColor, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** The unpaid cost in a payment prompt ("Pay {2}{G}{G}"), or null when it has symbols auto-pay won't decide (X, hybrid, Phyrexian, snow). */
export function parseCost(text: string): ManaCostParts | null {
  const symbols = [...text.matchAll(/\{([^}]+)\}/g)].map((match) => match[1].toUpperCase());
  if (symbols.length === 0) return null;
  const cost: ManaCostParts = { generic: 0, colored: {} };
  for (const symbol of symbols) {
    if (/^\d+$/.test(symbol)) cost.generic += Number(symbol);
    else if ((COLORS as string[]).includes(symbol)) cost.colored[symbol as ManaColor] = (cost.colored[symbol as ManaColor] ?? 0) + 1;
    else return null;
  }
  return cost;
}

interface ManaAbility {
  colors: ManaColor[];
  amount: number;
  restriction: string | null;
  costly: boolean;
}

/** One mana ability's rule ("{T}, Pay 1 life: Add {B}."), or null when it isn't one auto-pay can read (X, "for each"). */
function readAbility(rule: string): ManaAbility | null {
  const match = /^\(?\s*([^:]*):\s*Add ([^.]*)\.?(.*)$/i.exec(stripMarkup(rule).replace(/^\d+\.\s*/, '').trim());
  if (!match) return null;
  const [, cost, clause, rest] = match;
  if (/\{X\}|\bX\b|for each|equal to/i.test(clause)) return null;
  let colors: ManaColor[];
  let amount: number;
  const any = /\b(one|two|three|four|five) mana (?:of any (?:one )?(color|type)|in any combination of colors)/i.exec(clause);
  if (any) {
    amount = NUMBERS[any[1].toLowerCase()];
    colors = any[2]?.toLowerCase() === 'type' ? COLORS : ANY_COLOR;
  } else {
    // "{U} or {B}" is one mana of either; "{C}{C}{C}" is three
    const symbols = (text: string) => [...text.matchAll(/\{([WUBRGC])\}/gi)].map((symbol) => symbol[1].toUpperCase() as ManaColor);
    colors = [...new Set(symbols(clause))];
    amount = symbols(clause.split(/,|\bor\b/i)[0]).length;
  }
  if (amount === 0 || colors.length === 0) return null;
  return {
    colors,
    amount,
    restriction: /Spend this mana only[^.]*\.?/i.exec(rest)?.[0] ?? null,
    costly: cost.trim().toUpperCase() !== '{T}' || /damage to you|lose \d+ life|you lose|sacrifice/i.test(rest),
  };
}

/**
 * What a permanent's mana abilities add, read from its rules text and basic land types; undefined when it has none
 * auto-pay can read. A permanent with several abilities is read by its best ones: free of drawbacks (a painland's
 * {C}), then unrestricted, so restricted or painful mana is only planned when it is all the permanent makes.
 */
export function manaOf(
  permanent: Pick<PermanentView, 'rules' | 'subTypes' | 'cardTypes' | 'superTypes' | 'name'>,
): ManaReading | undefined {
  const rules = (permanent.rules ?? []).map((rule) => stripMarkup(rule));
  const abilities = rules.map(readAbility).filter((ability): ability is ManaAbility => ability !== null);
  const basicColors = (permanent.subTypes ?? []).map((type) => BASIC_TYPES[type]).filter(Boolean);
  if (basicColors.length > 0) abilities.push({ colors: basicColors, amount: 1, restriction: null, costly: false });
  if (abilities.length === 0) return undefined;

  const clean = abilities.filter((ability) => !ability.restriction && !ability.costly);
  const unrestricted = abilities.filter((ability) => !ability.restriction);
  const best = clean.length > 0 ? clean : unrestricted.length > 0 ? unrestricted : abilities;
  const text = rules.join(' ');
  return {
    colors: COLORS.filter((color) => best.some((ability) => ability.colors.includes(color))),
    amount: Math.max(...best.map((ability) => ability.amount)),
    isLand: (permanent.cardTypes ?? []).includes('LAND'),
    basic: (permanent.superTypes ?? []).includes('BASIC') || BASIC_NAMES.test(permanent.name ?? ''),
    restricted: best.some((ability) => ability.restriction),
    restriction: best.find((ability) => ability.restriction)?.restriction ?? null,
    noUntap: /doesn't untap during (?:your|its controller's) untap step/i.test(text),
    // City of Brass: the damage comes from a trigger, not the ability
    costly: best.every((ability) => ability.costly) || /Whenever [^.]* becomes tapped, [^.]*damage to you/i.test(text),
  };
}

/**
 * Whether restricted mana can pay for this: only restrictions to casting spells of one card type ("artifact
 * spells") are read, and only for a spell on the stack; anything else is left to the player.
 */
export function canSpend(restriction: string, spell: Pick<CardView, 'cardTypes'> | null): boolean {
  const type = /^Spend this mana only to cast (?:an? )?(artifact|creature|enchantment|instant|sorcery|planeswalker) spells?\.?$/i
    .exec(restriction.trim())?.[1];
  return !!type && !!spell && (spell.cardTypes ?? []).includes(type.toUpperCase() as CardType);
}

/**
 * A permanent as a source for paying the cost of `spell` (the spell being paid for, null for an ability or an
 * unknown one): null when it has no mana ability auto-pay can read, or only restricted mana this cost can't use.
 */
export function manaSource(
  id: string,
  permanent: Pick<PermanentView, 'rules' | 'subTypes' | 'cardTypes' | 'superTypes' | 'name'>,
  spell: Pick<CardView, 'cardTypes'> | null,
): ManaSource | null {
  const mana = manaOf(permanent);
  if (!mana || (mana.restriction && !canSpend(mana.restriction, spell))) return null;
  const { colors, amount, isLand, basic, restricted, noUntap, costly } = mana;
  return { id, colors, amount, isLand, basic, restricted, noUntap, costly };
}

/**
 * How many untapped sources of each color to keep for the rest of the hand: for each color, the most of it one card
 * asks for, among the cards still castable with the `spare` sources this payment leaves (cost text as "{1}{G}").
 */
export function handNeeds(costs: string[], spare: number): Partial<Record<ManaColor, number>> {
  const needs: Partial<Record<ManaColor, number>> = {};
  for (const text of costs) {
    const cost = parseCost(text);
    if (!cost) continue;
    const colored = Object.values(cost.colored).reduce((sum, value) => sum + (value ?? 0), 0);
    if (colored === 0 || cost.generic + colored > spare) continue;
    for (const color of COLORS) {
      const wanted = cost.colored[color] ?? 0;
      if (wanted > (needs[color] ?? 0)) needs[color] = wanted;
    }
  }
  return needs;
}

/**
 * The floating mana to spend next on this cost, or null when none of the pool fits. Floating mana empties at the end
 * of the step, so it pays before any source is tapped: colored symbols with their own color, then generic with
 * colorless, then the colors `keep` doesn't want, the most plentiful first. The server spends the pool by itself
 * only when it holds a single kind of mana (XMage's restricted auto-payment), so a mixed pool needs this.
 */
export function nextPoolMana(
  cost: ManaCostParts,
  pool: Partial<Record<ManaColor, number>>,
  keep: Partial<Record<ManaColor, number>> = {},
): ManaColor | null {
  const has = (color: ManaColor) => (pool[color] ?? 0) > 0;
  for (const color of COLORS) {
    if ((cost.colored[color] ?? 0) > 0 && has(color)) return color;
  }
  if (cost.generic === 0) return null;
  const candidates = COLORS.filter(has).sort((a, b) =>
    Number(b === 'C') - Number(a === 'C')
    || Number(!keep[b]) - Number(!keep[a])
    || (pool[b] ?? 0) - (pool[a] ?? 0));
  return candidates[0] ?? null;
}

/** The next source to tap, and the color it is tapped for (the answer when the server asks which mana it adds). */
export interface ManaTap {
  id: string;
  color: ManaColor;
}

/** Generic mana from a source, best first; LAST is never tapped automatically. */
const LAST = 6;
function genericTier(source: ManaSource, owed: number): number {
  if (source.noUntap || source.costly || source.amount > owed) return LAST;
  // restricted mana only reaches the plan when this cost qualifies, and it pays nothing else
  if (source.restricted) return 0;
  if (source.amount > 1) return 5;
  if (!source.isLand) return 4;
  if (source.basic) return 1;
  return source.colors.length === 1 ? 2 : 3;
}

/**
 * Whether `owed` generic mana can still be paid from these sources without a LAST one: any number of one-mana
 * sources, plus bigger ones whose mana adds up to no more than what's owed.
 */
function covers(owed: number, sources: ManaSource[]): boolean {
  if (owed <= 0) return true;
  const fine = sources.filter((source) => !source.noUntap && !source.costly);
  const ones = fine.filter((source) => source.amount === 1).length;
  const sums = new Set([0]);
  for (const big of fine.filter((source) => source.amount > 1 && source.amount <= owed)) {
    for (const sum of [...sums]) if (sum + big.amount <= owed) sums.add(sum + big.amount);
  }
  return [...sums].some((sum) => sum + ones >= owed);
}

/**
 * The next source to tap for this cost, or null when the payment isn't clear enough to make for the player.
 * Colored symbols are covered first by sources of that color, single-color ones before those that could make
 * another. Generic mana then goes to restricted mana this spell can use, basic lands, other lands, lands with a
 * choice of colors, creatures and rocks, and bigger sources that don't overpay; of equals, to the colors with sources
 * to spare beyond what `keep` (the rest of the hand, see handNeeds) wants untapped, colors nothing needs first, and
 * the most plentiful. Sources that overpay, don't untap or cost more than a tap are never planned for generic mana,
 * and colored mana takes them only when nothing else makes that color.
 */
export function nextTap(cost: ManaCostParts, sources: ManaSource[], keep: Partial<Record<ManaColor, number>> = {}): ManaTap | null {
  const remaining = sources.filter((source) => source.colors.length > 0 && source.amount > 0);
  const remove = (source: ManaSource) => remaining.splice(remaining.indexOf(source), 1);
  const left = (color: ManaColor) => remaining.filter((source) => source.colors.includes(color)).length;
  // colors with sources to spare, and of those the ones nothing in hand needs; a source with a choice is worth its scarcest
  const rank = ({ colors }: ManaSource) => Math.min(...colors.map((color) => {
    const needed = keep[color] ?? 0;
    return 2 * Number(left(color) > needed) + Number(!needed);
  }));
  const plenty = ({ colors }: ManaSource) => Math.max(...colors.map(left));
  // mana a tapped source adds beyond the symbol it was tapped for (Sol Ring's second {C})
  const extra: Partial<Record<ManaColor, number>> = {};
  let extraAny = 0;
  const owed = { ...cost.colored };
  let generic = cost.generic;
  const plan: ManaTap[] = [];

  for (const color of COLORS) {
    while ((owed[color] ?? 0) > 0) {
      owed[color]! -= 1;
      if ((extra[color] ?? 0) > 0) {
        extra[color]! -= 1;
        continue;
      }
      const useful = 1 + (owed[color] ?? 0) + generic;
      const needsLater = (source: ManaSource) =>
        source.colors.filter((other) => other !== color && COLORS.indexOf(other) > COLORS.indexOf(color) && (owed[other] ?? 0) > 0).length;
      const flawed = (source: ManaSource) => Number(source.restricted || source.noUntap || source.costly || source.amount > useful);
      const source = remaining.filter((candidate) => candidate.colors.includes(color)).sort((a, b) =>
        flawed(a) - flawed(b)
        || a.colors.length - b.colors.length
        || needsLater(a) - needsLater(b)
        || Number(b.isLand) - Number(a.isLand))[0];
      if (!source) return null;
      remove(source);
      plan.push({ id: source.id, color });
      if (source.colors.length === 1) extra[color] = (extra[color] ?? 0) + source.amount - 1;
      else extraAny += source.amount - 1;
    }
  }
  generic -= Math.min(generic, extraAny + Object.values(extra).reduce((sum, value) => sum + (value ?? 0), 0));
  // generic: spend what the rest of the cost and the hand don't need, and nothing that overpays or hurts
  while (generic > 0) {
    const owedNow = generic;
    const source = remaining
      .filter((candidate) => genericTier(candidate, owedNow) < LAST)
      .sort((a, b) =>
        genericTier(a, owedNow) - genericTier(b, owedNow)
        || a.colors.length - b.colors.length
        || rank(b) - rank(a)
        || plenty(b) - plenty(a))
      .find((candidate) => covers(owedNow - candidate.amount, remaining.filter((other) => other !== candidate)));
    if (!source) return null;
    remove(source);
    const color = [...source.colors].sort((a, b) => (keep[a] ?? 0) - (keep[b] ?? 0))[0];
    plan.push({ id: source.id, color });
    generic -= source.amount;
  }
  return plan[0] ?? null;
}

/** The id of the next source to tap for this cost (see nextTap). */
export function nextSource(cost: ManaCostParts, sources: ManaSource[], keep: Partial<Record<ManaColor, number>> = {}): string | null {
  return nextTap(cost, sources, keep)?.id ?? null;
}

/**
 * The answer to the server's question right after auto-pay tapped a source with a choice of mana: which of its
 * abilities (Underground Sea's {U} or {B}) or which color ("one mana of any color"). Null when the question is
 * about something else or doesn't offer the color, so the player answers it.
 */
export function manaChoiceAnswer(prompt: Prompt, sourceName: string, color: ManaColor): Command | null {
  if (prompt.kind === 'chooseAbility') {
    if (!sourceName || !prompt.text.toLowerCase().includes(sourceName.toLowerCase())) return null;
    const choice = prompt.choices
      .map((candidate) => ({ id: candidate.id, ability: readAbility(candidate.text) }))
      .filter(({ ability }) => ability && !ability.restriction && ability.colors.includes(color))
      .sort((a, b) => Number(a.ability!.costly) - Number(b.ability!.costly) || a.ability!.colors.length - b.ability!.colors.length)[0];
    return choice ? { type: 'uuid', id: choice.id } : null;
  }
  if (prompt.kind === 'chooseChoice') {
    const choice = prompt.choice;
    if (choice.manaColorChoice !== true) return null;
    const name = COLOR_NAMES[color].toLowerCase();
    const keyed = Object.entries(choice.keyChoices ?? {}).find(([, label]) => stripMarkup(label).trim().toLowerCase() === name);
    if (keyed) return { type: 'string', value: keyed[0] };
    const plain = (choice.choices ?? []).find((label) => stripMarkup(label).trim().toLowerCase() === name);
    return plain ? { type: 'string', value: plain } : null;
  }
  return null;
}
