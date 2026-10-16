import { flagCode, flagGlyph, flagLabel, parseAvatarCard, sigilOf } from '../../core/social/identity';
import { useCardImage } from '../../core/images/useCardImage';
import styles from './Avatar.module.css';

/** A player's disc: the art of the card they picked, their sigil, or their initial. */
export function Avatar({ name, avatarId, avatarCard, size = 'md' }: { name: string; avatarId?: number | null; avatarCard?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const sigil = sigilOf(avatarId);
  const art = useCardImage(parseAvatarCard(avatarCard), 'front', 'art_crop');
  if (typeof art === 'string') {
    return <span className={[styles.avatar, styles[size], styles.art].join(' ')} style={{ backgroundImage: `url("${art}")` }} aria-hidden="true" />;
  }
  return (
    <span className={[styles.avatar, styles[size], sigil ? styles.sigil : ''].join(' ')} aria-hidden="true">
      {sigil ?? (name.slice(0, 1).toUpperCase() || '?')}
    </span>
  );
}

/** A player's flag, from the server's flag file name; nothing for the default globe unless asked. */
export function Flag({ flagName, always = false }: { flagName?: string | null; always?: boolean }) {
  const code = flagCode(flagName);
  if (code === 'world' && !always) return null;
  return <span className={styles.flag} role="img" aria-label={flagLabel(code)} title={flagLabel(code)}>{flagGlyph(code)}</span>;
}
