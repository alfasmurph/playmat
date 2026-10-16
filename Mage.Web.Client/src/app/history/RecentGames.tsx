import { ChevronDown, Clapperboard } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { buildLogRows, endReason, savedEntry } from '../../core/game/gameLog';
import { formatDate, useT } from '../i18n';
import { endReasonText } from '../match/endReasonText';
import { LogRows } from '../match/LogLine';
import '../match/matchMessages';
import { MAX_RECORDS, type GameRecord } from '../stores/gameRecords';
import { Button } from '../ui/Button';
import { Zone } from '../ui/Zone';
import styles from './RecentGames.module.css';

/** The games finished in this browser, newest first: what happened in each, and its replay while the server has it. */
export function RecentGames({ records, me, replayIds, onReplay }: {
  records: readonly GameRecord[];
  me: string;
  /** games the server still has a replay of */
  replayIds: ReadonlySet<string | undefined>;
  onReplay(gameId: string): void;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Zone label={t('history.recent.title')} className={styles.zone}>
      {records.length === 0
        ? <p className={styles.empty}>{t('history.recent.empty')}</p>
        : <p className={styles.note}>{t('history.recent.note', { count: MAX_RECORDS })}</p>}
      <ul className={styles.list}>
        {records.map((record) => (
          <RecentGame
            key={record.gameId}
            record={record}
            me={me}
            open={open === record.gameId}
            onToggle={() => setOpen(open === record.gameId ? null : record.gameId)}
            replay={replayIds.has(record.gameId) ? () => onReplay(record.gameId) : null}
          />
        ))}
      </ul>
    </Zone>
  );
}

function RecentGame({ record, me, open, onToggle, replay }: { record: GameRecord; me: string; open: boolean; onToggle(): void; replay: (() => void) | null }) {
  const t = useT();
  const panel = useId();
  const date = formatDate(record.endedAt, { dateStyle: 'medium', timeStyle: 'short' });
  const meta = [
    record.deckName,
    record.turns ? t('history.recent.turns', { count: record.turns }) : '',
    date,
  ].filter(Boolean).join(' · ');
  return (
    <li className={styles.row}>
      <button type="button" className={styles.head} aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        <span className={[styles.result, styles[record.result] ?? ''].join(' ')}>{t(`history.recent.${record.result}`)}</span>
        <span className={styles.main}>
          <span className={styles.name}>{t('history.recent.vs', { names: record.opponents.join(', ') || '?' })}</span>
          {record.reason && <span className={styles.reason}>{endReasonText(t, record.reason)}</span>}
          <span className={styles.meta}>{meta}</span>
        </span>
        <ChevronDown size={18} className={styles.chevron} aria-hidden="true" />
      </button>
      {open && (
        <div id={panel} className={styles.detail} role="region" aria-label={t('history.recent.logLabel', { date })}>
          <SavedLog record={record} me={me} />
          {replay && <Button size="sm" icon={<Clapperboard size={15} />} onClick={replay}>{t('match.end.watchReplay')}</Button>}
        </div>
      )}
    </li>
  );
}

function SavedLog({ record, me }: { record: GameRecord; me: string }) {
  const t = useT();
  const { rows, reasonKey } = useMemo(() => {
    const entries = record.log.map(([icon, text], index) => savedEntry(`l${index}`, text, icon));
    return { rows: buildLogRows(entries, me), reasonKey: endReason(entries, me)?.key ?? null };
  }, [record.log, me]);
  return (
    <LogRows rows={rows} highlight={reasonKey} className={styles.log} label={t('history.recent.logLabel', { date: formatDate(record.endedAt, { dateStyle: 'medium', timeStyle: 'short' }) })} empty={t('history.recent.noLog')} />
  );
}
