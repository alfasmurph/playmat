import type { Bracket } from '../../core/decks/bracket';

// Wizards' names for the brackets (core/decks/bracket has them too; this stays out of it to keep the shelf light)
const NAMES: Record<Bracket, string> = { 1: 'Exhibition', 2: 'Core', 3: 'Upgraded', 4: 'Optimized', 5: 'cEDH' };
import styles from './BracketBadge.module.css';

/**
 * A Commander deck's bracket as a small stamp: "B3". Solid when its owner set it, outlined while it's an estimate.
 */
export function BracketBadge({ bracket, set, detail }: { bracket: Bracket; set: boolean; detail?: string }) {
  const label = `Bracket ${bracket}, ${NAMES[bracket]}${set ? '' : ' (estimated)'}`;
  return (
    <span className={[styles.badge, set ? styles.set : ''].join(' ')} title={detail ? `${label}\n${detail}` : label} aria-label={label} role="img">
      B{bracket}
    </span>
  );
}
