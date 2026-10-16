import type { BracketEstimate } from '../../core/decks/bracket';
import type { CareerChapter } from '../../protocol/generated/views';
import { useT } from '../i18n';
import { bracketOf } from '../stores/brackets';
import type { PreconSet, RosterDeck } from '../stores/decks';
import { BracketBadge } from '../ui/BracketBadge';
import { asBracket, bracketOfChoice, campaignDeckOf, preconBracket } from './campaignDeck';
import type { CampaignDeckState } from './useCampaignDeck';
import styles from './CareerModes.module.css';

/** A deck's bracket as a stamp, or nothing when it isn't known (0, or not a Commander deck). */
export function DeckBracket({ value }: { value: number | null | undefined }) {
  const bracket = asBracket(value);
  return bracket ? <BracketBadge bracket={bracket} set={false} /> : null;
}

const labelOf = (deck: RosterDeck, estimates: Record<string, BracketEstimate>, precons: readonly PreconSet[]) => {
  const bracket = bracketOf(deck, estimates, preconBracket(precons, deck.id));
  return bracket ? `${deck.name} · B${bracket.bracket}` : deck.name;
};

/**
 * Which deck to play a chapter with: the chapter's own (the default, when it has one) or a Commander deck of the
 * player's. With their own deck, a fork's upgrade pack still pays but leaves their deck as it is.
 */
export function CampaignDeckPicker({ chapter, state, forks }: {
  chapter: Pick<CareerChapter, 'id' | 'deckName' | 'deckBracket'>;
  state: Pick<CampaignDeckState, 'chosenId' | 'choose' | 'choices' | 'estimates' | 'precons'>;
  /** the chapter has upgrade packs at its forks */
  forks: boolean;
}) {
  const t = useT();
  const { chosenId, choose, choices, estimates, precons } = state;
  const choice = campaignDeckOf({ ownDeck: true }, chapter, chosenId, choices);
  const bracket = bracketOfChoice(choice, estimates, precons);
  const value = choice.kind === 'own' ? choice.deck.id : '';
  return (
    <div className={styles.deckChoice}>
      <label className={styles.field}>
        <span>{t('career.campaign.yourDeck')}</span>
        <span className={styles.deckChoiceRow}>
        <select value={value} onChange={(event) => choose(event.target.value || null)}>
          {chapter.deckName
            ? <option value="">{t('career.campaign.chapterDeckOption', { deck: chapter.deckName })}</option>
            : <option value="" disabled>{t('career.campaign.pickDeck')}</option>}
          {choices.mine.length > 0 && (
            <optgroup label={t('career.campaign.myDecks')}>
              {choices.mine.map((deck) => <option key={deck.id} value={deck.id}>{labelOf(deck, estimates, precons)}</option>)}
            </optgroup>
          )}
          {precons.map((set) => (
            <optgroup key={set.id} label={t('career.campaign.preconSet', { set: set.name })}>
              {choices.precons.filter((deck) => deck.precon?.set === set.name).map((deck) => (
                <option key={deck.id} value={deck.id}>{labelOf(deck, estimates, precons)}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {bracket && <BracketBadge bracket={bracket.bracket} set={bracket.set} />}
        </span>
      </label>
      {choice.kind === 'none' && <p className={styles.small}>{t('career.campaign.needDeck')}</p>}
      {choice.kind === 'own' && forks && <p className={styles.small}>{t('career.campaign.ownDeckForks')}</p>}
    </div>
  );
}
