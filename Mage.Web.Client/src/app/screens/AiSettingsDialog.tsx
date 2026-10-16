import { useEffect, useMemo } from 'react';
import { PRECON_PREFIX, rosterOf, useDecks, type DeckKind, type RosterDeck } from '../stores/decks';
import { bracketOf, useBrackets } from '../stores/brackets';
import { useT } from '../i18n';
import { DEFAULT_AI_OPTIONS, usePlay } from '../stores/play';
import { AI_TYPES, DIFFICULTIES, difficultyOf, offeredAiTypes } from './aiSetup';
import { useServerState } from '../queries';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import styles from './AiSettingsDialog.module.css';

function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? styles.segmentOn : styles.segment}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * How the next game against the AI is set up, for the shelf's kind of deck: the AI's deck is one of that kind, and the
 * table size is Commander's. Changes apply right away and are remembered in this browser.
 */
export function AiSettingsDialog({ open, onOpenChange, kind }: { open: boolean; onOpenChange(open: boolean): void; kind: DeckKind }) {
  const options = usePlay((state) => state.aiOptions);
  const setOptions = usePlay((state) => state.setAiOptions);
  const decks = useDecks();
  const roster = useMemo(() => rosterOf(decks).filter((deck) => deck.kind === kind), [decks, kind]);
  const starters = roster.filter((deck) => deck.starter);
  const mine = roster.filter((deck) => !deck.starter && !deck.precon);
  // any Commander precon can be the AI's in a commander game
  const precons = kind === 'commander' ? decks.precons : [];
  useEffect(() => {
    if (open && kind === 'commander') void useDecks.getState().loadPrecons();
  }, [open, kind]);
  // each deck's bracket beside its name, to set up an even table
  const estimates = useBrackets((state) => state.estimates);
  useEffect(() => {
    if (open && kind === 'commander') void useBrackets.getState().ensure(roster);
  }, [open, kind, roster]);
  const labelOf = (deck: RosterDeck) => {
    const bracket = bracketOf(deck, estimates);
    return bracket ? `${deck.name} · B${bracket.bracket}` : deck.name;
  };
  // one deck per AI seat; a deck of the other kind is never the AI's in this kind of game: it gets a random starter
  const seats = kind === 'commander' ? options.opponents : 1;
  const known = (id: string | null | undefined) => !!id && (roster.some((deck) => deck.id === id) || precons.some((set) => set.decks.some((deck) => PRECON_PREFIX + deck.file === id)));
  const seatDeck = (seat: number) => (known(options.opponentDeckIds[seat]) ? options.opponentDeckIds[seat] : null);
  const pickDeck = (seat: number, id: string | null) => {
    const opponentDeckIds = Array.from({ length: Math.max(seats, options.opponentDeckIds.length) }, (_, index) => options.opponentDeckIds[index] ?? null);
    opponentDeckIds[seat] = id;
    setOptions({ opponentDeckIds });
  };
  const difficulty = difficultyOf(options.skill);
  const t = useT();
  // a server can leave the Monte Carlo AI out
  const playerTypes = useServerState().data?.playerTypes;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('ai.title')}
      width="md"
      footer={(
        <>
          <Button variant="quiet" onClick={() => setOptions(DEFAULT_AI_OPTIONS)}>{t('ai.restore')}</Button>
          <Button variant="print" onClick={() => onOpenChange(false)}>{t('ai.done')}</Button>
        </>
      )}
    >
      <div className={styles.form}>
        <section className={styles.row}>
          <h3 className={styles.label}>{t('ai.difficulty')}</h3>
          <Segmented
            label={t('ai.difficulty')}
            value={difficulty.skill}
            options={DIFFICULTIES.map((item) => ({ value: item.skill, label: t(item.label) }))}
            onChange={(skill) => setOptions({ skill })}
          />
          <p className={styles.detail}>{t(difficulty.detail)}</p>
        </section>

        {kind === 'commander' && (
          <section className={styles.row}>
            <h3 className={styles.label}>{t('ai.pod')}</h3>
            <Segmented
              label={t('ai.pod.label')}
              value={options.opponents}
              options={[{ value: 1 as const, label: t('ai.pod.one') }, { value: 2 as const, label: t('ai.pod.three') }, { value: 3 as const, label: t('ai.pod.four') }]}
              onChange={(opponents) => setOptions({ opponents })}
            />
            <p className={styles.detail}>{t('ai.pod.detail')}</p>
          </section>
        )}
        {Array.from({ length: seats }, (_, seat) => (
          <section key={seat} className={styles.row}>
            <label className={styles.label} htmlFor={`ai-deck-${seat}`}>{seats > 1 ? t('ai.deck.seat', { seat: seat + 1 }) : t('ai.deck')}</label>
            <select
              id={`ai-deck-${seat}`}
              className={styles.select}
              value={seatDeck(seat) ?? ''}
              onChange={(event) => pickDeck(seat, event.target.value || null)}
            >
              <option value="">{t('ai.deck.random')}</option>
              {starters.length > 0 && (
                <optgroup label={t(kind === 'commander' ? 'ai.deck.commanderStarters' : 'ai.deck.starters')}>
                  {starters.map((deck) => <option key={deck.id} value={deck.id}>{labelOf(deck)}</option>)}
                </optgroup>
              )}
              {mine.length > 0 && (
                <optgroup label={t('ai.deck.yours')}>
                  {mine.map((deck) => <option key={deck.id} value={deck.id}>{labelOf(deck)}</option>)}
                </optgroup>
              )}
              {precons.map((set) => (
                <optgroup key={set.id} label={t('ai.deck.precons', { set: set.name, year: set.year })}>
                  {set.decks.map((deck) => <option key={deck.file} value={PRECON_PREFIX + deck.file}>{deck.bracket ? `${deck.name} · B${deck.bracket}` : deck.name}</option>)}
                </optgroup>
              ))}
            </select>
          </section>
        ))}

        <section className={styles.row}>
          <h3 className={styles.label}>{t('ai.type')}</h3>
          <Segmented label={t('ai.type')} value={options.aiType} options={offeredAiTypes(playerTypes).map((item) => ({ value: item.value, label: t(item.label) }))} onChange={(aiType) => setOptions({ aiType })} />
          <p className={styles.detail}>{t(AI_TYPES.find((item) => item.value === options.aiType)?.detail ?? 'ai.type.standard.detail')}</p>
        </section>

        <div className={styles.pair}>
          <section className={styles.row}>
            <h3 className={styles.label}>{t('ai.match')}</h3>
            <Segmented
              label={t('ai.match.length')}
              value={options.winsNeeded}
              options={[{ value: 1 as const, label: t('ai.match.one') }, { value: 2 as const, label: t('ai.match.three') }]}
              onChange={(winsNeeded) => setOptions({ winsNeeded })}
            />
          </section>
          <section className={styles.row}>
            <h3 className={styles.label}>{t('ai.life')}</h3>
            <Segmented
              label={t('ai.life')}
              value={options.startingLife ?? 0}
              options={[{ value: 0, label: t('ai.life.format') }, ...[20, 30, 40].map((life) => ({ value: life, label: String(life) }))]}
              onChange={(life) => setOptions({ startingLife: life === 0 ? null : (life as 20 | 30 | 40) })}
            />
          </section>
        </div>

        <section className={styles.row}>
          <h3 className={styles.label}>{t('ai.rules')}</h3>
          <Segmented
            label={t('ai.rules')}
            value={options.rules}
            options={[{ value: 'casual' as const, label: t('ai.rules.casual') }, { value: 'deck' as const, label: t('ai.rules.deck') }]}
            onChange={(rules) => setOptions({ rules })}
          />
          <p className={styles.detail}>
            {t(options.rules === 'casual' ? 'ai.rules.casual.detail' : 'ai.rules.deck.detail')}
          </p>
        </section>

      </div>
    </Dialog>
  );
}
