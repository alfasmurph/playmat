import {
  AlertTriangle, ArrowDownToLine, Ban, BellRing, BookOpen, Dot, Flag, Flame, Heart, HeartCrack, MessageCircle,
  Mountain, Shield, Shuffle, Skull, Sparkles, Swords, Trophy, Archive, Zap, type LucideIcon,
} from 'lucide-react';
import { memo, type Ref } from 'react';
import { cardInk, findLogCard, type LogEntry, type LogIcon, type LogRow, type LogSegment } from '../../core/game/gameLog';
import type { CardView } from '../../protocol/generated/views';
import { useT } from '../i18n';
import { PromptText } from '../ui/PromptText';
import './matchMessages';
import { useMatchUi } from './matchUi';
import styles from './LogLine.module.css';

const ICONS: Record<LogIcon, LucideIcon> = {
  turn: Dot,
  cast: Sparkles,
  land: Mountain,
  ability: Zap,
  trigger: BellRing,
  attack: Swords,
  block: Shield,
  damage: Flame,
  lifeGain: Heart,
  lifeLoss: HeartCrack,
  draw: BookOpen,
  discard: ArrowDownToLine,
  counter: Ban,
  destroy: Skull,
  exile: Archive,
  mulligan: Shuffle,
  win: Trophy,
  lose: Flag,
  chat: MessageCircle,
  error: AlertTriangle,
  info: Dot,
};

export type SeenCards = { current: Map<string, CardView> };

/**
 * Log rows as a list, the one way the game's lines are laid out: in the game's drawer, on the end screen and in a
 * saved game. `cards` (every card seen this game) makes card names hoverable and clickable; without it they are
 * plain chips. `highlight` marks one line by its key.
 */
export function LogRows({ rows, cards, highlight, empty, listRef, className, label }: {
  rows: readonly LogRow[];
  cards?: SeenCards;
  highlight?: string | null;
  empty?: string;
  listRef?: Ref<HTMLOListElement>;
  className?: string;
  /** names a list that scrolls, which also takes the keyboard so it can be read without a mouse */
  label?: string;
}) {
  const t = useT();
  return (
    <ol ref={listRef} className={[styles.list, className ?? ''].join(' ')} aria-label={label} tabIndex={label ? 0 : undefined}>
      {rows.length === 0 && <li className={styles.empty}>{empty ?? t('match.log.empty')}</li>}
      {rows.map((row) => (row.kind === 'separator'
        ? (
          <li key={row.key} className={[styles.separator, row.mine ? styles.separatorMine : ''].join(' ')}>
            <span>{t('match.log.turn', { turn: row.turn })}{row.player ? ` · ${row.mine ? t('match.log.you') : row.player}` : ''}</span>
          </li>
        )
        : <LogLine key={row.key} entry={row.entry} cards={cards} highlighted={row.key === highlight} />))}
    </ol>
  );
}

export const LogLine = memo(function LogLine({ entry, cards, highlighted = false }: { entry: LogEntry; cards?: SeenCards; highlighted?: boolean }) {
  const Icon = ICONS[entry.icon];
  return (
    <li className={[styles.line, styles[entry.tone], highlighted ? styles.reason : ''].join(' ')}>
      <Icon className={[styles.icon, styles[`icon_${entry.icon}`] ?? ''].join(' ')} size={16} aria-hidden="true" />
      <span className={styles.body}>
        {entry.who && <b>{entry.who}: </b>}
        {entry.segments.map((segment, index) => <Segment key={index} segment={segment} cards={cards} />)}
      </span>
    </li>
  );
});

function Segment({ segment, cards }: { segment: LogSegment; cards?: SeenCards }) {
  const setZoom = useMatchUi((state) => state.setZoom);
  const openDetail = useMatchUi((state) => state.openDetail);
  // PromptText trims, and the space beside a name or card chip is what keeps it from running into the words
  if (segment.kind === 'text') return <>{/^\s/.test(segment.text) && ' '}<PromptText text={segment.text} />{/\s$/.test(segment.text) && ' '}</>;
  if (segment.kind === 'player') return <span className={styles.player}>{segment.name}</span>;
  const ink = [styles.card, styles[`ink_${cardInk(segment.color) ?? 'none'}`] ?? ''].join(' ');
  if (!cards) return <span className={[ink, styles.plainCard].join(' ')}>{segment.name}</span>;
  // looked up when used: the card may have moved since the line was written
  const find = () => findLogCard(cards.current, segment);
  return (
    <button
      type="button"
      className={ink}
      onPointerEnter={(event) => {
        const card = find();
        if (card) setZoom({ card, x: event.clientX, y: event.clientY, anchor: event.currentTarget });
      }}
      onPointerLeave={() => setZoom(null)}
      onClick={() => {
        const card = find();
        if (card?.id) openDetail({ id: card.id, card });
      }}
      aria-label={`${segment.name}, show card`}
    >
      {segment.name}
    </button>
  );
}
