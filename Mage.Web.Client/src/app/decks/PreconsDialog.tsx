import { Copy, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { PRECON_PREFIX, preconToRoster, useDecks, type PreconSet } from '../stores/decks';
import { useShelf } from '../stores/shelf';
import { notify } from '../stores/toasts';
import { Button } from '../ui/Button';
import type { Bracket } from '../../core/decks/bracket';
import { DeckBox } from '../ui/DeckBox';
import { Dialog } from '../ui/Dialog';
import styles from './PreconsDialog.module.css';

/**
 * The real Commander precons, by set, oldest first. One plays as printed (it sits on the shelf while it's the
 * selected deck), or becomes your own deck to change.
 */
export function PreconsDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
  const navigate = useNavigate();
  const [sets, setSets] = useState<PreconSet[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !sets) void useDecks.getState().loadPrecons().then(setSets);
  }, [open, sets]);

  /** Play shows the Commander shelf with this deck picked, as it does a deck just imported. */
  const pickOnPlay = (id: string) => {
    useShelf.getState().setKind('commander');
    useShelf.getState().pick('commander', id);
  };

  const play = () => {
    if (!chosen) return;
    useDecks.getState().select(chosen);
    pickOnPlay(chosen);
    onOpenChange(false);
    navigate('/');
  };

  const copy = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      pickOnPlay(await useDecks.getState().duplicate(chosen));
      onOpenChange(false);
    } catch (error) {
      notify(t('decks.precons'), error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('decks.preconsTitle')}
      description={t('decks.preconsNote')}
      width="xl"
      footer={(
        <>
          <Button variant="quiet" icon={<Copy size={16} />} disabled={!chosen || busy} onClick={() => void copy()}>{t('decks.copyToMine')}</Button>
          <Button variant="print" icon={<Play size={16} />} disabled={!chosen || busy} onClick={play}>{t('decks.preconPlay')}</Button>
        </>
      )}
    >
      {!sets ? (
        <p className={styles.note}>{t('decks.preconsLoading')}</p>
      ) : (
        <div className={styles.sets}>
          {sets.map((preconSet) => (
            <section key={preconSet.id} className={styles.set} aria-labelledby={`precon-${preconSet.id}`}>
              <h3 className={styles.setName} id={`precon-${preconSet.id}`}>
                {preconSet.name}
                {!preconSet.name.includes(String(preconSet.year)) && <span className={styles.year}>{preconSet.year}</span>}
              </h3>
              <div className={styles.grid} role="list">
                {preconSet.decks.map((deck) => {
                  const id = PRECON_PREFIX + deck.file;
                  const entry = { ...preconToRoster(preconSet, deck), note: deck.commanders.join(' & ') };
                  return (
                    <div key={id} role="listitem">
                      <DeckBox deck={entry} sleeve="var(--sleeve-default)" bracket={deck.bracket ? { bracket: deck.bracket as Bracket, set: false } : null} selected={chosen === id} onSelect={() => setChosen(id)} onActivate={() => setChosen(id)} />
                      {chosen === id && deck.changes?.map((change) => <p key={change} className={styles.change}>{change}</p>)}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
