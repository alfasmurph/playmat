import type { ManaAvailableView } from '../../protocol/generated/views';

/** One colour's line in the readout: its Mana font symbol and the most of it you could make. */
export interface ManaReadoutColor {
  symbol: 'w' | 'u' | 'b' | 'r' | 'g' | 'c';
  name: string;
  count: number;
}

export interface ManaReadout {
  /** the most mana any one way of tapping makes */
  total: number;
  colors: ManaReadoutColor[];
  /** mana of a colour you pick (Command Tower, Arcane Signet) */
  any: number;
}

const COLORS: { key: keyof ManaAvailableView; symbol: ManaReadoutColor['symbol']; name: string }[] = [
  { key: 'white', symbol: 'w', name: 'white' },
  { key: 'blue', symbol: 'u', name: 'blue' },
  { key: 'black', symbol: 'b', name: 'black' },
  { key: 'red', symbol: 'r', name: 'red' },
  { key: 'green', symbol: 'g', name: 'green' },
  { key: 'colorless', symbol: 'c', name: 'colorless' },
];

/** The readout for the server's summary of your mana; null when there's none to show. */
export function manaReadout(available: ManaAvailableView | null | undefined): ManaReadout | null {
  const total = available?.total ?? 0;
  if (!available || total <= 0) return null;
  return {
    total,
    colors: COLORS.map(({ key, symbol, name }) => ({ symbol, name, count: Number(available[key] ?? 0) })).filter((color) => color.count > 0),
    any: available.any ?? 0,
  };
}

/** "9 mana: up to 3 white, 4 green and 2 of any colour" */
export function describeManaReadout(readout: ManaReadout): string {
  const parts = readout.colors.map((color) => `${color.count} ${color.name}`);
  if (readout.any > 0) parts.push(`${readout.any} of any colour`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] ?? '';
  return `${readout.total} mana you could make${list ? `: up to ${list}` : ''}`;
}
