import { BRACKETS, BRACKET_NAMES, bracketReasons, bracketSummary, type Bracket, type BracketEstimate } from '../../core/decks/bracket';
import { useT } from '../i18n';
import { useDecks, type RosterDeck } from '../stores/decks';
import { notify } from '../stores/toasts';
import { BracketBadge } from '../ui/BracketBadge';
import styles from './BracketPicker.module.css';

/**
 * A Commander deck's bracket, by its name: the estimate and what it rests on, and for the player's own deck a choice
 * of any bracket (a deck site's rating, or how they mean it to play), kept with the deck.
 */
export function BracketPicker({ deck, info }: { deck: RosterDeck; info: { bracket: Bracket; set: boolean; estimate: BracketEstimate | null } }) {
  const t = useT();
  // starters, precons and friends' decks show their estimate; only your own decks take a bracket
  const editable = !deck.starter && !deck.precon && !deck.sharedBy;
  const summary = info.estimate ? bracketSummary(info.estimate) : '';
  const why = info.estimate ? bracketReasons(info.estimate).join('\n') : '';
  const estimated = info.estimate ? t('bracket.estimate', { bracket: info.estimate.bracket, name: BRACKET_NAMES[info.estimate.bracket] }) : t('bracket.estimateUnknown');

  function choose(value: string) {
    useDecks.getState().setBracket(deck.id, value ? Number(value) : null).catch((error: unknown) => notify(t('bracket.saveFailed'), error instanceof Error ? error.message : String(error)));
  }

  return (
    <div className={styles.line}>
      <BracketBadge bracket={info.bracket} set={info.set} detail={why} />
      {editable ? (
        <select className={styles.select} aria-label={t('bracket.label')} value={info.set ? String(info.bracket) : ''} onChange={(event) => choose(event.target.value)}>
          <option value="">{estimated}</option>
          {BRACKETS.map((bracket) => <option key={bracket} value={bracket}>{t('bracket.option', { bracket, name: BRACKET_NAMES[bracket] })}</option>)}
        </select>
      ) : (
        <span className={styles.name}>{t('bracket.option', { bracket: info.bracket, name: BRACKET_NAMES[info.bracket] })}</span>
      )}
      <span className={styles.why} title={why || undefined}>{summary || t('bracket.plain')}</span>
    </div>
  );
}
