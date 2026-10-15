import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { SavedGameEntry } from '../../protocol/generated/views';
import { api } from '../connection';
import { useT } from '../i18n';
import { usePlay } from '../stores/play';
import { useSession } from '../stores/session';
import { notify } from '../stores/toasts';
import { Button, IconButton } from '../ui/Button';
import styles from './UnfinishedGames.module.css';

const SAVED_GAMES = 'savedGames';

/** "5 minutes ago", in the reader's language. */
function ago(at: number | undefined, locale: string | undefined): string {
  if (!at) return '';
  const minutes = Math.round((Date.now() - at) / 60_000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return format.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 48) return format.format(-hours, 'hour');
  return format.format(-Math.round(hours / 24), 'day');
}

/**
 * Games against the AI the player didn't finish (the server saves them at every turn's start, so a restart or
 * leaving doesn't lose them): play one on from that turn, or throw it away. Nothing shows while there are none.
 */
export function UnfinishedGames({ disabled = false }: { disabled?: boolean }) {
  const t = useT();
  const client = useQueryClient();
  const userName = useSession((state) => state.userName);
  const signedIn = useSession((state) => state.phase === 'signedIn' && state.connection === 'open');
  const games = useQuery({ queryKey: [SAVED_GAMES, userName], queryFn: () => api.savedGameList(), enabled: signedIn, staleTime: 0 });
  const [confirming, setConfirming] = useState<string | null>(null);
  const list = (games.data ?? []) as SavedGameEntry[];
  if (list.length === 0) return null;

  const playOn = async (gameId: string) => {
    try {
      await usePlay.getState().playSaved(gameId);
    } catch (error) {
      notify(t('home.unfinished'), error instanceof Error ? error.message : String(error), 'error');
      void client.invalidateQueries({ queryKey: [SAVED_GAMES] });
    }
  };

  const throwAway = async (gameId: string) => {
    setConfirming(null);
    await api.savedGameDelete(gameId).catch(() => false);
    void client.invalidateQueries({ queryKey: [SAVED_GAMES] });
  };

  return (
    <section className={styles.unfinished} aria-labelledby="unfinished-label">
      <h3 className={styles.label} id="unfinished-label">
        <History size={16} aria-hidden="true" /> {t('home.unfinished')}
      </h3>
      <ul className={styles.list}>
        {list.map((game) => (
          <li key={game.gameId} className={styles.game}>
            <div className={styles.what}>
              <b>{t('home.unfinished.vs', { names: (game.opponents ?? []).join(', ') || 'AI' })}</b>
              <small>
                {[game.deckName, t('home.unfinished.turn', { turn: game.turn ?? 1, life: game.life ?? 0 }), ago(game.savedAt, undefined)].filter(Boolean).join(' · ')}
              </small>
            </div>
            {confirming === game.gameId ? (
              <div className={styles.actions}>
                <Button size="sm" variant="quiet" onClick={() => setConfirming(null)}>{t('home.unfinished.keep')}</Button>
                <Button size="sm" variant="danger" onClick={() => void throwAway(game.gameId!)}>{t('home.unfinished.throwAway')}</Button>
              </div>
            ) : (
              <div className={styles.actions}>
                <IconButton label={t('home.unfinished.throwAway')} icon={<Trash2 size={16} />} onClick={() => setConfirming(game.gameId!)} disabled={disabled} />
                <Button size="sm" variant="print" icon={<Play size={16} />} disabled={disabled} onClick={() => void playOn(game.gameId!)}>
                  {t('home.unfinished.playOn')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
