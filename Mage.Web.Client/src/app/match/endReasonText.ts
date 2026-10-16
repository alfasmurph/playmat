import type { Translate } from '../i18n';
import type { SavedReason } from '../stores/gameRecords';

/** Why the game ended as a sentence ("Najeela drew from an empty library."); the reason is an EndReason or a saved one. */
export function endReasonText(t: Translate, reason: SavedReason): string {
  if (reason.kind === 'drawLoop') return t('match.end.reason.drawLoop');
  if (reason.kind === 'card') {
    return reason.mine
      ? t('match.end.reason.card.you', { card: reason.card ?? '' })
      : t('match.end.reason.card.other', { name: reason.player, card: reason.card ?? '' });
  }
  return reason.mine
    ? t(`match.end.reason.${reason.kind}.you`)
    : t(`match.end.reason.${reason.kind}.other`, { name: reason.player });
}
