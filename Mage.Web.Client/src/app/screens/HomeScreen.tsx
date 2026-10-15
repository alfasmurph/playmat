import { ChevronRight, Crown, Download, PencilRuler, Search, SlidersHorizontal, Star, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { rosterOf, sleeveFor, useDecks, type DeckKind, type RosterDeck } from '../stores/decks';
import { activeKind, arrange, pickOn, shelfOf, SHELF_TOOLS_AFTER, useShelf, type ShelfSort } from '../stores/shelf';
import { useCoach } from '../stores/coach';
import { usePlay, type AiOptions } from '../stores/play';
import { useT, type MessageKey } from '../i18n';
import { Button, IconButton } from '../ui/Button';
import { DeckBox } from '../ui/DeckBox';
import { MatPrint } from '../ui/MatPrint';
import { storeCards } from '../ui/imageCache';
import { DEVICE_PICTURES } from '../nativePictures';
import { AiSettingsDialog } from './AiSettingsDialog';
import { useImportDrop, useImportPaste } from '../decks/import/useImportShortcuts';
import { openImport, useImportSheet } from '../stores/importSheet';
import { describeAi } from './aiSetup';
import { slotsFull, useGameSlots, useServerInfo } from '../queries';
import styles from './HomeScreen.module.css';

type Mode = 'ai' | 'practice' | 'friend';

// open tables and events have their own pages in the rail; here the only question is who you play
const MODES: { id: Mode; label: MessageKey }[] = [
  { id: 'ai', label: 'home.mode.ai' },
  { id: 'practice', label: 'home.mode.practice' },
  { id: 'friend', label: 'home.mode.friend' },
];

const TABLES: { value: AiOptions['opponents']; label: MessageKey }[] = [
  { value: 1, label: 'ai.pod.one' },
  { value: 2, label: 'ai.pod.three' },
  { value: 3, label: 'ai.pod.four' },
];

const MATCHES: { value: AiOptions['winsNeeded']; label: MessageKey }[] = [
  { value: 1, label: 'ai.match.one' },
  { value: 2, label: 'ai.match.three' },
];

const SORTS: { value: ShelfSort; label: MessageKey }[] = [
  { value: 'recent', label: 'home.sort.recent' },
  { value: 'name', label: 'home.sort.name' },
];

/** What "Build" on an empty Commander shelf starts the deck builder with. */
const COMMANDER_FORMAT = 'Variant Magic - Commander';

/**
 * One choice of a few, printed as segments: a radio group, where the arrow keys move the choice and Tab enters and
 * leaves the group at the chosen one.
 */
function Segments<T extends string | number>({ label, value, options, onChange, disabled, className, itemClassName, onClassName }: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; name?: string }[];
  onChange(value: T): void;
  disabled?: boolean;
  className: string;
  itemClassName: string;
  onClassName: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  }
  return (
    <div className={className} role="radiogroup" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-label={option.name}
          tabIndex={value === option.value ? 0 : -1}
          className={[itemClassName, value === option.value ? onClassName : ''].join(' ')}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
          disabled={disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** commander names by deck (and the save they were read from), so a shelf switch doesn't read the list again */
const commandersRead = new Map<string, string[]>();

/** The commanders of a commander deck, read from its list (XMage keeps them in the sideboard). */
function useCommanders(deck: RosterDeck | null): string[] {
  const id = deck?.kind === 'commander' ? deck.id : null;
  const key = id ? `${id}@${deck?.updatedAt ?? ''}` : null;
  const [read, setRead] = useState<{ key: string; names: string[] } | null>(null);
  useEffect(() => {
    if (!id || !key || commandersRead.has(key)) return;
    let live = true;
    void useDecks.getState().loadList(id)
      .then((list) => {
        const names = [...new Set(list.sideboard.map((card) => card.cardName))];
        commandersRead.set(key, names);
        if (live) setRead({ key, names });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id, key]);
  if (!key) return [];
  return commandersRead.get(key) ?? (read?.key === key ? read.names : []);
}

/** Home: your deck on your mat, one decision away from a game. */
export function HomeScreen() {
  const navigate = useNavigate();
  const t = useT();
  const decks = useDecks();
  const play = usePlay();
  const shelfState = useShelf();
  const [mode, setMode] = useState<Mode>('ai');
  const [aiOpen, setAiOpen] = useState(false);
  const [query, setQuery] = useState('');
  const roster = useMemo(() => rosterOf(decks), [decks]);
  // Commander and 60-card decks sit on separate shelves; each keeps its own picked deck
  const kind = activeKind(shelfState.kind, roster, decks.selectedId);
  const shelf = useMemo(() => shelfOf(roster, kind), [roster, kind]);
  const counts = useMemo(() => ({ commander: shelfOf(roster, 'commander').length, standard: shelfOf(roster, 'standard').length }), [roster]);
  const tools = shelf.length > SHELF_TOOLS_AFTER;
  const listed = useMemo(() => arrange(shelf, tools ? query : '', shelfState.sort), [shelf, tools, query, shelfState.sort]);
  const selected = pickOn(shelf, shelfState.picks[kind], decks.selectedId);
  const sleeve = sleeveFor(decks.sleeves, selected);
  const commanders = useCommanders(selected);
  const busy = play.phase !== 'idle';
  const firstGameDone = useCoach((state) => state.firstGameDone);
  const skipFirstGame = useCoach((state) => state.finish);
  // Career is offered by servers with accounts; it is opt-in, and its screen explains it first
  const serverInfo = useServerInfo().data;
  const career = serverInfo?.career === true;
  // what staff want everyone to know, e.g. that a contributors server's data may be reset
  const notice = serverInfo?.notice?.trim();
  // a small server runs a few games at once; past that a new game waits for a free slot
  const full = slotsFull(useGameSlots().data);
  const { dragging, dropProps } = useImportDrop();
  useImportPaste();

  useEffect(() => {
    if (!decks.loaded) void decks.refresh();
  }, [decks]);

  // a deck just imported goes on its own shelf, picked, even when it isn't the shelf on show
  const arrivedId = useImportSheet((state) => state.arrivedId);
  useEffect(() => {
    const deck = arrivedId ? rosterOf(useDecks.getState()).find((entry) => entry.id === arrivedId) : undefined;
    if (!deck) return;
    useShelf.getState().setKind(deck.kind);
    useShelf.getState().pick(deck.kind, deck.id);
  }, [arrivedId]);

  // the Android app keeps the chosen deck's pictures on the device, so its next game opens without the network
  const selectedId = selected?.id;
  useEffect(() => {
    if (!DEVICE_PICTURES || !selectedId) return;
    void useDecks.getState().loadList(selectedId)
      .then((deck) => storeCards([...deck.cards, ...deck.sideboard].map((card) => ({ name: card.cardName, setCode: card.setCode ?? undefined, cardNumber: card.cardNumber ?? undefined }))))
      .catch(() => undefined);
  }, [selectedId]);

  function choose(deck: RosterDeck) {
    decks.select(deck.id);
    shelfState.pick(kind, deck.id);
  }

  /** Another shelf: its last picked deck becomes the selected one. */
  function switchShelf(next: DeckKind) {
    if (next === kind) return;
    shelfState.setKind(next);
    setQuery('');
    const deck = pickOn(shelfOf(roster, next), shelfState.picks[next], decks.selectedId);
    if (deck) decks.select(deck.id);
  }

  function start() {
    if (!selected) return;
    switch (mode) {
      case 'ai':
        void play.playVsAi(selected.id);
        break;
      case 'practice':
        void play.playVsAi(selected.id, { practice: true });
        break;
      case 'friend':
        navigate('/tables', { state: { host: selected.id } });
        break;
    }
  }

  const opponentDeck = roster.find((deck) => deck.id === play.aiOptions.opponentDeckId && deck.kind === kind);

  return (
    <div className={styles.home}>
      <aside className={styles.roster} aria-label={t('home.yourDecks')}>
        <Segments
          label={t('home.format')}
          value={kind}
          onChange={switchShelf}
          disabled={busy}
          className={styles.formats}
          itemClassName={styles.format}
          onClassName={styles.formatOn}
          options={[
            {
              value: 'commander',
              name: `${t('home.format.commander')}, ${t('home.format.decks', { count: counts.commander })}`,
              label: (
                <>
                  <span className={styles.formatName}>{t('home.format.commander')}</span>
                  <span className={styles.formatMeta}>{t('home.format.decks', { count: counts.commander })}</span>
                </>
              ),
            },
            {
              value: 'standard',
              name: `${t('home.format.standard')}, ${t('home.format.standardHint')}, ${t('home.format.decks', { count: counts.standard })}`,
              label: (
                <>
                  <span className={styles.formatName}>{t('home.format.standard')}</span>
                  <span className={styles.formatMeta}>
                    <span className={styles.formatHint}>{t('home.format.standardHint')}</span>
                    {t('home.format.decks', { count: counts.standard })}
                  </span>
                </>
              ),
            },
          ]}
        />
        <header className={styles.rosterHead}>
          <h2>{t('home.yourDecks')}</h2>
          <span className={styles.rosterActions}>
            <Button variant="quiet" size="sm" onClick={() => openImport()}>{t('home.import')}</Button>
            <Button variant="quiet" size="sm" onClick={() => navigate('/decks')}>{t('home.manage')}</Button>
          </span>
        </header>
        {tools && (
          <div className={styles.shelfTools}>
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('home.find')}
                aria-label={t('home.find')}
              />
            </label>
            <Segments
              label={t('home.sort')}
              value={shelfState.sort}
              onChange={shelfState.setSort}
              className={styles.sorts}
              itemClassName={styles.sort}
              onClassName={styles.sortOn}
              options={SORTS.map((item) => ({ value: item.value, label: t(item.label) }))}
            />
          </div>
        )}
        <div className={[styles.rosterList, dragging ? styles.dropping : ''].join(' ')} {...dropProps}>
          {listed.length > 0 && (
            <div className={styles.decks} role="list">
              {listed.map((deck) => (
                <div role="listitem" key={deck.id}>
                  <DeckBox
                    deck={deck}
                    sleeve={sleeveFor(decks.sleeves, deck)}
                    selected={deck.id === selected?.id}
                    onSelect={() => choose(deck)}
                    onActivate={() => {
                      choose(deck);
                      if (mode === 'ai') void play.playVsAi(deck.id);
                      if (mode === 'practice') void play.playVsAi(deck.id, { practice: true });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          {shelf.length > 0 && listed.length === 0 && (
            <p className={styles.empty} role="status">{t('home.noMatch', { query: query.trim() })}</p>
          )}
          {decks.loaded && shelf.length === 0 && (
            <div className={styles.emptyShelf}>
              <h3>{t(kind === 'commander' ? 'home.empty.commander.title' : 'home.empty.standard.title')}</h3>
              <p>{t(kind === 'commander' ? 'home.empty.commander' : 'home.empty.standard')}</p>
              <span className={styles.emptyActions}>
                <Button variant="print" size="sm" icon={<Download size={16} />} onClick={() => openImport()}>{t('home.import')}</Button>
                <Button
                  variant="quiet"
                  size="sm"
                  icon={<PencilRuler size={16} />}
                  onClick={() => navigate(kind === 'commander' ? `/decks/new?format=${encodeURIComponent(COMMANDER_FORMAT)}` : '/decks/new')}
                >
                  {t('home.build')}
                </Button>
              </span>
            </div>
          )}
        </div>
      </aside>

      <section className={styles.mat} style={{ '--sleeve': sleeve } as CSSProperties}>
        <MatPrint card={selected?.cover ?? null} />
        {notice && <p className={styles.serverNotice} role="note" aria-label={t('home.notice')}>{notice}</p>}
        <div className={styles.deckTitle}>
          {commanders.length > 0 && (
            <p className={styles.commander}>
              <Crown size={18} aria-hidden="true" />
              <span className={styles.commanderLabel}>{t('home.commander', { count: commanders.length })}</span>
              <span className={styles.commanderNames}>{commanders.join(' & ')}</span>
            </p>
          )}
          <div className={styles.deckNameLine}>
            <h1 className={styles.deckName}>{selected?.name ?? t('home.chooseDeck')}</h1>
            {selected && (
              <IconButton
                className={[styles.pin, selected.favorite ? styles.pinOn : ''].join(' ')}
                label={selected.favorite ? t('decks.unfavorite') : t('decks.favorite')}
                pressed={!!selected.favorite}
                icon={<Star size={20} fill={selected.favorite ? 'currentColor' : 'none'} />}
                onClick={() => useDecks.getState().toggleFavorite(selected.id)}
              />
            )}
          </div>
          <p className={styles.deckNote}>{selected?.fromStarter ? t('decks.fromStarter', { count: selected.cardCount }) : selected?.note ?? ' '}</p>
        </div>

        <div className={styles.playZone} role="group" aria-labelledby="play-zone-label">
          <h2 id="play-zone-label" className={styles.zoneLabel}>{t('home.play')}</h2>
          {!firstGameDone && (
            <div className={styles.firstGame}>
              <p className={styles.firstGameText}>{t('home.firstGame.text')}</p>
              <span className={styles.firstGameActions}>
                <Button variant="quiet" size="sm" onClick={skipFirstGame} disabled={busy}>{t('home.firstGame.skip')}</Button>
                <Button variant="print" size="sm" onClick={() => selected && void play.playVsAi(selected.id, { guided: true })} disabled={busy || !selected}>
                  {t('home.firstGame.start')}
                </Button>
              </span>
            </div>
          )}
          <Segments<Mode>
            label={t('home.opponent')}
            value={mode}
            onChange={setMode}
            disabled={busy}
            className={styles.modes}
            itemClassName={styles.mode}
            onClassName={styles.modeOn}
            options={MODES.map((item) => ({ value: item.id, label: t(item.label) }))}
          />
          {mode === 'ai' && (
            // the one setting that shapes this kind of game sits here; the rest are behind the AI setup line
            <div className={styles.option}>
              <span className={styles.optionLabel} aria-hidden="true">{t(kind === 'commander' ? 'home.table' : 'ai.match')}</span>
              {kind === 'commander' ? (
                <Segments
                  label={t('ai.pod.label')}
                  value={play.aiOptions.opponents}
                  onChange={(opponents) => play.setAiOptions({ opponents })}
                  disabled={busy}
                  className={styles.choices}
                  itemClassName={styles.choice}
                  onClassName={styles.choiceOn}
                  options={TABLES.map((item) => ({ value: item.value, label: t(item.label) }))}
                />
              ) : (
                <Segments
                  label={t('ai.match.length')}
                  value={play.aiOptions.winsNeeded}
                  onChange={(winsNeeded) => play.setAiOptions({ winsNeeded })}
                  disabled={busy}
                  className={styles.choices}
                  itemClassName={styles.choice}
                  onClassName={styles.choiceOn}
                  options={MATCHES.map((item) => ({ value: item.value, label: t(item.label) }))}
                />
              )}
            </div>
          )}
          {mode === 'ai' && (
            <button type="button" className={styles.aiSetup} onClick={() => setAiOpen(true)} disabled={busy}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>{describeAi(t, play.aiOptions, opponentDeck?.name ?? null, kind)}</span>
              <span className={styles.aiSetupAction}>{t('home.change')}</span>
            </button>
          )}
          {mode === 'practice' && <p className={styles.modeNote}>{t('home.practiceNote')}</p>}
          {mode === 'friend' && <p className={styles.modeNote}>{t('home.friendNote')}</p>}
          {full && <p className={styles.modeNote} role="status">{t('home.serverFull')}</p>}
          {play.error && <p className={styles.error} role="alert">{play.error}</p>}
          <div className={styles.playRow}>
            {busy && (
              <Button variant="quiet" onClick={() => void play.cancel()}>{t('home.cancel')}</Button>
            )}
            <Button
              variant="decision"
              size="xl"
              busy={busy}
              disabled={!selected}
              onClick={start}
              className={styles.playButton}
            >
              {t(busy ? (play.phase === 'waitingForGame' ? 'home.shuffling' : 'home.settingUp') : mode === 'friend' ? 'home.continue' : 'home.play')}
            </Button>
          </div>
          {career && (
            <button type="button" className={styles.career} onClick={() => navigate('/career')} disabled={busy}>
              <Trophy size={18} aria-hidden="true" />
              <span className={styles.careerText}>
                <b>{t('home.career')}</b>
                <small>{t('home.career.note')}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </section>
      <AiSettingsDialog open={aiOpen} onOpenChange={setAiOpen} kind={kind} />
    </div>
  );
}
