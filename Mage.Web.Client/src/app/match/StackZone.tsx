import { useMemo, useRef } from 'react';
import type { CardView } from '../../protocol/generated/views';
import { isStackAbility } from '../../core/game/cards';
import { AbilityCard } from '../ui/AbilityCard';
import { CardFace } from '../ui/CardFace';
import { zoneKeys } from './boardModel';
import { stackPeek } from './matchLayout';
import { useFlip } from './flip';
import { useMatchUi } from './matchUi';
import styles from './StackZone.module.css';

export interface StackZoneProps {
  /** top of the stack first */
  items: CardView[];
  clickable: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  sleeveOf(card: CardView): string;
  onClick(id: string): void;
  /** a tap (or Enter) on any object: picks it up to read it; without it only legal choices take a click */
  onTap?(id: string): void;
  /** opponents' spells fly in from their hidden hand */
  originOf(card: CardView): string | undefined;
}

/** Spells and abilities waiting to resolve, piled down the right of the table; the top one resolves first. */
export function StackZone({ items, clickable, selected, sleeveOf, onClick, onTap, originOf }: StackZoneProps) {
  // a spell keeps its card's identity (abilities have no card of their own): it is the card that left the hand
  const keys = useMemo(() => zoneKeys(items.map((item) => (isStackAbility(item) ? { id: item.id } : item))), [items]);
  if (items.length === 0) return null;
  return (
    <section className={styles.zone} aria-label={`Stack, ${items.length} ${items.length === 1 ? 'object' : 'objects'}`}>
      <h2 className={styles.label}>Stack</h2>
      <ol className={styles.list} style={{ ['--peek' as string]: `${stackPeek(items.length)}px` }}>
        {items.map((item, index) => (
          <StackItem
            key={keys[index]}
            item={item}
            index={index}
            total={items.length}
            clickable={clickable.has(item.id!)}
            selected={selected.has(item.id!)}
            sleeve={sleeveOf(item)}
            onClick={onClick}
            onTap={onTap}
            origin={originOf(item)}
          />
        ))}
      </ol>
    </section>
  );
}

function StackItem({ item, index, total, clickable, selected, sleeve, onClick, onTap, origin }: {
  item: CardView;
  index: number;
  total: number;
  clickable: boolean;
  selected: boolean;
  sleeve: string;
  onClick(id: string): void;
  onTap?(id: string): void;
  origin: string | undefined;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const setZoom = useMatchUi((state) => state.setZoom);
  const ability = isStackAbility(item) ? item : null;
  const face = ability?.sourceCard ?? item;
  useFlip(ability ? item.id : (item.cardId ?? item.id), ref, { fallbackOrigin: origin });
  const tap = () => {
    if (onTap) onTap(item.id!);
    else if (clickable) onClick(item.id!);
  };

  return (
    <li
      ref={ref}
      className={[styles.item, index === 0 ? styles.top : '', clickable ? styles.clickable : '', onTap ? styles.readable : '', selected ? styles.selected : ''].join(' ')}
      style={{ zIndex: total - index, ['--i' as string]: index }}
      onPointerEnter={(event) => setZoom({ card: item, x: event.clientX, y: event.clientY, sleeve })}
      onPointerLeave={() => setZoom(null)}
      tabIndex={clickable || onTap ? 0 : undefined}
      onClick={tap}
      onKeyDown={(event) => {
        if ((clickable || onTap) && event.key === 'Enter') {
          event.preventDefault();
          tap();
        }
      }}
      data-object-id={item.id}
      aria-label={`${ability ? 'Ability of ' : ''}${face.name}${index === 0 ? ', resolves next' : ''}`}
    >
      {ability ? <AbilityCard ability={item} sleeve={sleeve} /> : <CardFace card={face} sleeve={sleeve} size="normal" />}
      {index === 0 && <span className={styles.next}>Resolving next</span>}
    </li>
  );
}
