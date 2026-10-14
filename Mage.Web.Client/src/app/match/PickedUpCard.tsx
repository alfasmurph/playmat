import * as RadixDialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { isStackAbility } from '../../core/game/cards';
import { rulesOf } from '../../core/game/glossary';
import type { Interaction } from '../../core/game/interaction';
import { playOptions, type PlayOption } from '../../core/game/playOptions';
import { stripMarkup } from '../../core/game/prompt';
import type { CardView, GameView, StackAbilityView } from '../../protocol/generated/views';
import { AbilityCard } from '../ui/AbilityCard';
import { Button } from '../ui/Button';
import { CardFace } from '../ui/CardFace';
import { PromptText } from '../ui/PromptText';
import { findCard, typeLine } from './cardLookup';
import { motionAllowed } from './flip';
import { useMatchUi } from './matchUi';
import { useStage, type StageContextValue } from './stageContext';
import styles from './PickedUpCard.module.css';

const NO_OPTIONS: readonly PlayOption[] = [];

/**
 * A card picked up off the table (a tap): held up large in front of the board, the way a player lifts a card to read
 * it, with what it can do right now beside it. While the player holds priority those are the card's spells and
 * abilities from the server's playable list; otherwise it is only for reading. Choosing one uses it (see
 * GameSession.activate); the details view and putting it back are always there.
 */
export function PickedUpCard({ view, interaction, awaitingServer, extra, sleeveOf, onActivate }: {
  view: GameView | null;
  interaction: Interaction;
  awaitingServer: boolean;
  /** cards shown by an open overlay that aren't on the table */
  extra: readonly CardView[];
  sleeveOf(card: CardView): string;
  /** uses one of the card's abilities */
  onActivate(objectId: string, abilityId: string): void;
}) {
  const stage = useStage();
  const pickup = useMatchUi((state) => state.pickup);
  const putDown = useMatchUi((state) => state.putDown);
  const openDetail = useMatchUi((state) => state.openDetail);
  const id = pickup?.id ?? null;
  const found = id ? findCard(view, id, extra) : null;
  // a card whose face the player can't see is never held up
  const live = found && !found.hideInfo ? found : null;
  const options = useMemo(
    () => (id && live && interaction.mode === 'priority' && !awaitingServer ? playOptions(view, id, live) : NO_OPTIONS),
    [id, live, interaction.mode, awaitingServer, view],
  );

  // options were offered on this card: once the server is busy (an answer went out, from here or the corner) they
  // are stale, and the card goes back down rather than show a different set a moment later
  const offered = useRef(false);
  useEffect(() => {
    offered.current = false;
  }, [id]);
  useEffect(() => {
    if (options.length > 0) offered.current = true;
  }, [options]);
  useEffect(() => {
    if (!id) return;
    // the card left the table (played, died, shuffled away)
    if (!live || (awaitingServer && offered.current)) putDown();
  }, [id, live, awaitingServer, putDown]);

  // the stage is read when the card arrives, not on every resize
  const stageNow = useRef<StageContextValue>(stage);
  useLayoutEffect(() => {
    stageNow.current = stage;
  }, [stage]);
  // the card rises from where it lay to the middle of the table
  const lift = useCallback((element: HTMLDivElement | null) => {
    if (!element || !id || !motionAllowed()) return;
    const { element: stageElement, scale } = stageNow.current;
    const origin = stageElement?.querySelector<HTMLElement>(`[data-object-id="${CSS.escape(id)}"]`);
    if (!origin) return;
    const from = origin.getBoundingClientRect();
    const to = element.getBoundingClientRect();
    // the layout width: a tapped card's box is turned, a lifted hand card's is grown
    const fromWidth = (origin.offsetWidth || from.width / scale) * scale;
    if (!from.width || !to.width || !scale) return;
    const dx = (from.left + from.width / 2 - (to.left + to.width / 2)) / scale;
    const dy = (from.top + from.height / 2 - (to.top + to.height / 2)) / scale;
    element.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${fromWidth / to.width})` }, { transform: 'none' }],
      { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
  }, [id]);

  if (!id || !live) return null;

  // closing waits a tick: the key that closed it must not also reach the board's own shortcuts
  const close = () => setTimeout(putDown, 0);
  const ability = isStackAbility(live) ? live as StackAbilityView : null;
  const name = ability ? ability.sourceCard?.displayName ?? ability.sourceCard?.name ?? 'Ability' : live.displayName ?? live.name ?? 'Card';
  const kind = ability
    ? (live.abilityType?.startsWith('TRIGGERED') ? 'Triggered ability' : 'Activated ability')
    : typeLine(live);
  const rules = (ability ? live.rules ?? [] : rulesOf(live)).map(stripMarkup).filter(Boolean);
  const sleeve = sleeveOf(live);
  // the first spell or ability is the one the player most likely picked the card up for
  const primary = options.find((option) => option.kind !== 'mana');

  return (
    <RadixDialog.Root open onOpenChange={(open) => !open && close()}>
      <RadixDialog.Portal container={stage.element}>
        <RadixDialog.Overlay className={styles.scrim} />
        <RadixDialog.Content
          className={styles.held}
          aria-describedby={undefined}
          // back to the card on the table, if it is still there
          onCloseAutoFocus={(event) => {
            // the details view took over: focus belongs to it
            if (useMatchUi.getState().detail) {
              event.preventDefault();
              return;
            }
            const card = stage.element?.querySelector<HTMLElement>(`[data-object-id="${CSS.escape(id)}"]`);
            if (!card) return;
            event.preventDefault();
            card.focus({ preventScroll: true });
          }}
        >
          <div key={id} ref={lift} className={styles.card} data-card-id={id}>
            {ability ? <AbilityCard ability={live} sleeve={sleeve} /> : <CardFace card={live} size="large" sleeve={sleeve} />}
          </div>

          <div className={styles.side}>
            <header className={styles.head}>
              <RadixDialog.Title className={styles.name}>{name}</RadixDialog.Title>
              {kind && <p className={styles.type}>{kind}</p>}
            </header>

            {options.length === 0 && rules.length > 0 && (
              <ul className={styles.rules} aria-label="Card text">
                {rules.map((line, index) => <li key={index}><PromptText text={line} /></li>)}
              </ul>
            )}

            {options.length > 0 && (
              <div className={styles.options} role="group" aria-label="What it can do">
                {options.map((option) => (
                  <button
                    key={option.abilityId || option.label}
                    type="button"
                    className={[
                      styles.option,
                      option === primary ? styles.primary : '',
                      option.kind === 'cast' || option.kind === 'play' ? styles.spell : '',
                      option.kind === 'mana' ? styles.quiet : '',
                    ].join(' ')}
                    onClick={() => {
                      onActivate(id, option.abilityId);
                      close();
                    }}
                  >
                    <span className={styles.optionLabel}><PromptText text={option.label} /></span>
                    {option.detail && <span className={styles.optionDetail}><PromptText text={option.detail} /></span>}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.actions}>
              <Button variant="quiet" size="lg" onClick={() => openDetail({ id, card: live })}>Details</Button>
              <Button variant="quiet" size="lg" onClick={close}>Put down</Button>
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
