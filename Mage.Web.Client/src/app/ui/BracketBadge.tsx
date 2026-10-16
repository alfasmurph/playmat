import { BRACKET_NAMES, type Bracket } from '../../core/decks/bracket';
import styles from './BracketBadge.module.css';

/**
 * A Commander deck's bracket as a small stamp: "B3". Solid when its owner set it, outlined while it's an estimate.
 */
export function BracketBadge({ bracket, set, detail }: { bracket: Bracket; set: boolean; detail?: string }) {
  const label = `Bracket ${bracket}, ${BRACKET_NAMES[bracket]}${set ? '' : ' (estimated)'}`;
  return (
    <span className={[styles.badge, set ? styles.set : ''].join(' ')} title={detail ? `${label}\n${detail}` : label} aria-label={label} role="img">
      B{bracket}
    </span>
  );
}
