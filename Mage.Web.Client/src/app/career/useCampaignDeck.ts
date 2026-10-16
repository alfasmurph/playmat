import { useEffect, useMemo, useState } from 'react';
import type { CareerCampaign } from '../../protocol/generated/views';
import { useBrackets } from '../stores/brackets';
import { rosterOf, useDecks } from '../stores/decks';
import { commanderChoices, readCampaignDeck, writeCampaignDeck } from './campaignDeck';

/**
 * The deck chosen for a campaign that takes the player's own, with what it can be chosen from: the player's Commander
 * decks (their brackets estimated as they show) and the precons. Remembered per campaign.
 */
export function useCampaignDeck(campaign: CareerCampaign) {
  const campaignId = campaign.id ?? '';
  const enabled = !!campaign.ownDeck;
  const [chosenId, setChosenId] = useState<string | null>(() => (enabled ? readCampaignDeck(campaignId) : null));
  const decks = useDecks();
  const roster = useMemo(() => rosterOf(decks), [decks]);
  const choices = useMemo(() => commanderChoices(roster, decks.precons), [roster, decks.precons]);
  const estimates = useBrackets((state) => state.estimates);
  useEffect(() => {
    if (!enabled) return;
    if (!useDecks.getState().loaded) void useDecks.getState().refresh().catch(() => undefined);
    void useDecks.getState().loadPrecons().catch(() => undefined);
  }, [enabled]);
  useEffect(() => {
    if (enabled) void useBrackets.getState().ensure(choices.mine);
  }, [enabled, choices.mine]);
  const choose = (id: string | null) => {
    writeCampaignDeck(campaignId, id);
    setChosenId(id);
  };
  return { enabled, chosenId, choose, choices, estimates, precons: decks.precons };
}

export type CampaignDeckState = ReturnType<typeof useCampaignDeck>;
