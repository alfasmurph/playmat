import { useContext, useState, type CSSProperties } from 'react';
import { printsPowerToughness } from '../../core/game/cards';
import { useCardImage } from '../../core/images/useCardImage';
import { isDecoded, markDecoded } from './imageCache';
import type { CardFace as Face, CardImageRef, ImageSize } from '../../core/images/imageLinks';
import type { CardType, SubType } from '../../protocol/generated/views';
import { useT } from '../i18n';
import { ManaCost } from './ManaCost';
import { cardBackOf } from './cardBack';
import { SleevedContext, sleeveOnBack } from './sleeveArt';
import { useSettings } from '../stores/settings';
import styles from './CardFace.module.css';

export interface CardFaceProps {
  card: CardImageRef & {
    manaCostLeftStr?: string[];
    manaCost?: string;
    typeText?: string;
    power?: string;
    toughness?: string;
    rules?: string[];
    cardTypes?: CardType[];
    subTypes?: SubType[];
  };
  face?: Face;
  size?: ImageSize;
  /** sleeve color; the deck's sleeves frame every card the player owns */
  sleeve?: string;
  /** show the back of the card (hidden information) */
  hidden?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A card at real proportions, in its sleeve. While the picture loads (or when there is none) a printed text frame
 * with name, cost and type keeps the card readable and the layout stable.
 */
export function CardFace({ card, face = 'front', size = 'normal', sleeve, hidden, className, style }: CardFaceProps) {
  const t = useT();
  const src = useCardImage(hidden ? null : card, face, size);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = typeof src === 'string' && src !== failedSrc;
  // a picture decoded earlier this session shows on the first frame: no text-frame flash when a card changes zone
  const loaded = showImage && (loadedSrc === src || isDecoded(src));
  const name = card.displayName ?? card.name ?? '';

  return (
    <div
      className={[styles.sleeve, className ?? ''].join(' ')}
      style={{ ...(sleeve ? { '--sleeve': sleeve } : {}), ...style } as CSSProperties}
      data-loaded={loaded || undefined}
    >
      <div className={styles.card}>
        {hidden ? (
          <CardBack sleeve={sleeve} label={t('ui.hiddenCard')} />
        ) : (
          <>
            {!loaded && (
              // with a picture on its way the text frame waits a moment: a picture that arrives soon never flashes it
              <div className={[styles.frame, src === null || showImage ? styles.late : ''].join(' ')} aria-hidden={showImage ? true : undefined}>
                <div className={styles.titleBar}>
                  <span className={styles.name}>{name}</span>
                  <ManaCost cost={card.manaCostLeftStr ?? card.manaCost} size="sm" />
                </div>
                <div className={styles.art} />
                {card.typeText && <div className={styles.typeLine}>{card.typeText}</div>}
                {printsPowerToughness(card) && (
                  <div className={styles.pt}>{card.power}/{card.toughness}</div>
                )}
              </div>
            )}
            {showImage && (
              <img
                className={styles.image}
                src={src}
                alt={name}
                loading="lazy"
                decoding="async"
                draggable={false}
                onLoad={() => {
                  markDecoded(src);
                  setLoadedSrc(src);
                }}
                onError={() => setFailedSrc(src)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The back: the deck's sleeve (painted or dyed), the chosen back (classic or Playmat's), or the printed weave (see cardBackOf). */
function CardBack({ sleeve, label }: { sleeve: string | undefined; label: string }) {
  const paintedArt = useSettings((state) => state.settings.paintedArt);
  const back = useSettings((state) => state.settings.cardBack);
  const sleeved = useContext(SleevedContext);
  const look = cardBackOf(sleeveOnBack(sleeve, sleeved), { paintedArt, back });
  const art = look && 'art' in look ? look.art : null;
  return (
    <div
      className={styles.back}
      aria-label={label}
      role="img"
      data-art={art ? '' : undefined}
      data-dye={look && 'dye' in look ? '' : undefined}
      style={art ? { backgroundImage: `url(${art})` } : undefined}
    />
  );
}
