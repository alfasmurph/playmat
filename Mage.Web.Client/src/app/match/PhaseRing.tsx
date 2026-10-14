import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useState } from 'react';
import type { PhaseStep } from '../../protocol/generated/views';
import { useT } from '../i18n';
import './matchMessages';
import { useSettings } from '../stores/settings';
import { dotPosition, dotStates, stopSet, toggledStops, TURN_STEPS, type StopSide } from './phaseSteps';
import { lastPointerType, useLongPress } from './useLongPress';
import styles from './PhaseRing.module.css';

/** A step's name, read with a finger held on its dot, stays up this long (a finger has no hover to end it). */
const TOUCH_TIP_MS = 2200;

export interface PhaseRingProps {
  step: PhaseStep | undefined;
  /** your turn: the dots set your turn's stops; otherwise the opponents' */
  myTurn: boolean;
  turn: number;
  /** watching: whose turn it is, by name (a spectator has no turn of their own) */
  activeName?: string | null;
}

/**
 * Where the turn is, as a ring of dots around the active player's avatar: the steps gone this turn are filled
 * faintly, the one being played is filled and larger, the ones to come are hollow. A dot is also the stop at that
 * step on this player's turn: click (or tap) it to toggle the stop; a ring around the dot marks a stop that is set.
 * Its name shows on hover or focus, or under a finger held on it.
 */
export function PhaseRing({ step, myTurn, turn, activeName = null }: PhaseRingProps) {
  const t = useT();
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const fullControl = useSettings((state) => state.fullControl);
  const side: StopSide = myTurn ? 'yourTurn' : 'opponentTurn';
  const whoseTurn = myTurn ? 'your' : "opponents'";
  const states = dotStates(step);
  const [tip, setTip] = useState<number | null>(null);
  const [ring, setRing] = useState<HTMLElement | null>(null);

  // touch has no hover: a finger held on a dot names it instead of toggling its stop
  useLongPress(ring, {
    onLongPress: (target) => {
      const dot = target.closest('[data-step]');
      if (!dot || !ring?.contains(dot)) return false;
      setTip(Number(dot.getAttribute('data-step')));
      return true;
    },
  });
  useEffect(() => {
    if (tip === null || lastPointerType() === 'mouse') return;
    const timer = setTimeout(() => setTip(null), TOUCH_TIP_MS);
    return () => clearTimeout(timer);
  }, [tip]);

  return (
    <Tooltip.Provider delayDuration={200} skipDelayDuration={600}>
      <nav
        ref={setRing}
        className={styles.ring}
        aria-label={activeName ? t('match.turn.aria.player', { turn, name: activeName }) : t(myTurn ? 'match.turn.aria.yours' : 'match.turn.aria.theirs', { turn })}
      >
        <ol className={styles.dots}>
          {TURN_STEPS.map((turnStep, index) => {
            const own = stopSet(settings, side, turnStep);
            // under full control the game stops everywhere; the player's own stops come back when it is turned off
            const stopOn = fullControl || own;
            const state = states[index];
            const { x, y } = dotPosition(index);
            return (
              <li key={turnStep.name} className={styles.slot} style={{ left: x, top: y }}>
                <Tooltip.Root
                  open={tip === index}
                  onOpenChange={(open) => setTip((current) => (open ? index : current === index ? null : current))}
                >
                  <Tooltip.Trigger asChild>
                    <button
                      type="button"
                      data-step={index}
                      className={[styles.dot, styles[state], stopOn ? styles.stop : ''].join(' ')}
                      aria-label={turnStep.name}
                      aria-current={state === 'current' ? 'step' : undefined}
                      aria-pressed={stopOn}
                      // full control: still focusable, so its name and the reason it can't change can be read
                      aria-disabled={fullControl || undefined}
                      onClick={(event) => {
                        // the dots sit on a seat that may be a target: a click here is about the stop only
                        event.stopPropagation();
                        if (!fullControl) update(toggledStops(settings, side, turnStep, !own));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
                      }}
                    >
                      {/* the step's short name, for scripts that read the current step */}
                      <span className={styles.name}>{turnStep.label}</span>
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className={styles.tip} side="top" sideOffset={6} collisionPadding={8}>
                      <b>{turnStep.name}</b>
                      <span>
                        {fullControl
                          ? 'Full control: the game stops at every step'
                          : `${own ? 'Stops' : "Doesn't stop"} here on ${whoseTurn} turn${turnStep.combat ? ' when creatures attack' : ''}`}
                      </span>
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </li>
            );
          })}
        </ol>
      </nav>
    </Tooltip.Provider>
  );
}
