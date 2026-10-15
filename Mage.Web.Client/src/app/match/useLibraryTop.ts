import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { libraryTopLook, type RevealGroup } from '../../core/game/reveals';
import type { CardView } from '../../protocol/generated/views';
import { api } from '../connection';

/**
 * The top card of your library while an effect lets you look at it any time (Mystic Forge, Vizier of the
 * Menagerie): what was looked at, under its game id. The server sends only its printing, so its name, types and
 * text come from the card database; until they arrive, the printing alone draws its face.
 */
export function useLibraryTop(looks: readonly RevealGroup[]): CardView | null {
  const looked = useMemo(() => libraryTopLook(looks), [looks]);
  const setCode = looked?.expansionSetCode ?? '';
  const cardNumber = looked?.cardNumber ?? '';
  const details = useQuery({
    queryKey: ['libraryTop', setCode, cardNumber],
    queryFn: () => api.lookupCards([{ cardName: '', setCode, cardNumber, amount: 1 }]).then((cards) => cards[0] ?? null),
    enabled: !!setCode && !!cardNumber && !looked?.name,
    staleTime: Infinity,
  });
  return useMemo(() => {
    if (!looked?.id) return null;
    // the looked-at card's own game id and printing over the database's copy
    return { ...(details.data ?? {}), ...looked, id: looked.id, name: looked.name ?? details.data?.name };
  }, [looked, details.data]);
}
