import { useEffect, useRef, useState } from 'react';
import { DelayedRelay } from '../../core/game/broadcastDelay';
import type { GameSessionState } from '../../core/game/gameSession';
import { parseLogHtml, segmentsText } from '../../core/game/gameLog';
import type { ChatMessage } from '../../protocol/generated/views';
import { api, events } from '../connection';
import { useSettings } from '../stores/settings';
import { notify } from '../stores/toasts';
import { isEditableEventTarget } from '../ui/keys';
import { cueSnapshot, logCue, pickCues, type Cue, type CueSnapshot } from './cueRules';
import { playCue } from './sound';

/** seconds between a change's lead cue and its companion */
const COMPANION_GAP = 0.3;

/**
 * Plays a cue when something worth hearing happens: your turn, a decision, spells, combat, damage and healing,
 * deaths, tokens, exile, discards, lands, draws, taps and untaps, your clock running low, the result; and, from the
 * game log, shuffles, counterspells and mulligans. M mutes and unmutes.
 */
export function useGameCues(state: GameSessionState, myId: string | null, autoPassing = false) {
  const previous = useRef<CueSnapshot | null>(null);
  useEffect(() => {
    const now = cueSnapshot(state, myId);
    const cues = pickCues(previous.current, now, myId, autoPassing);
    previous.current = now;
    cues.forEach((cue, i) => playCue(cue, i * COMPANION_GAP));
  }, [state, myId, autoPassing]);

  useGameLogCues(state.gameId, state.mode !== 'replay', state.broadcastDelayMs);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'm' && event.key !== 'M') return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || isEditableEventTarget(event.target)) return;
      const { settings, update } = useSettings.getState();
      update({ sound: !settings.sound });
      notify(settings.sound ? 'Sound off' : 'Sound on', 'Press M to switch it back.');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * Cues from the game's log lines, which reach the client through the game's chat (GameLog joins it). Watching
 * with a broadcast delay, they wait as long as the board does.
 */
function useGameLogCues(gameId: string, live: boolean, delayMs: number) {
  const [relay] = useState(() => new DelayedRelay<Cue>((cue) => playCue(cue)));
  useEffect(() => relay.setDelay(delayMs), [relay, delayMs]);
  useEffect(() => () => relay.dispose(), [relay]);

  useEffect(() => {
    if (!live) return;
    let chatId: string | null = null;
    let cancelled = false;
    api.chatFindByGame(gameId)
      .then((id) => {
        if (!cancelled) chatId = id;
      })
      .catch(() => undefined);
    const off = events.on('CHATMESSAGE', (message: ChatMessage, event) => {
      if (!chatId || event.objectId !== chatId || message.messageType !== 'GAME') return;
      const cue = logCue(segmentsText(parseLogHtml(message.message)));
      if (cue) relay.push(cue);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [gameId, live, relay]);
}
