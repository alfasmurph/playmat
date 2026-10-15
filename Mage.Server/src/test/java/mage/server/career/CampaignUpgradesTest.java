package mage.server.career;

import mage.cards.decks.DeckCardInfo;
import mage.cards.decks.DeckCardLists;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The Commander's Road: the server applies the upgrade packs taken at a chapter's forks to its deck (the campaign's
 * own test checks every combination is legal; this one checks the server's code does the swap).
 */
public class CampaignUpgradesTest {

    private static int count(DeckCardLists deck) {
        return deck.getCards().stream().mapToInt(DeckCardInfo::getAmount).sum()
                + deck.getSideboard().stream().mapToInt(DeckCardInfo::getAmount).sum();
    }

    private static List<String> names(DeckCardLists deck) {
        return deck.getCards().stream().map(DeckCardInfo::getCardName).collect(Collectors.toList());
    }

    @Test
    void forkPacksSwapCardsIntoTheChapterDeck() throws Exception {
        CareerCampaigns campaigns = CareerCampaigns.get();
        CareerCampaigns.Chapter ghave = campaigns.campaigns().get("commander-road").chapters.get(0);
        CareerCampaigns.CareerOption tokens = ghave.nodes.stream().filter(node -> node.id.equals("ghave-fork-1")).findFirst().get()
                .options.stream().filter(option -> option.id.equals("tokens")).findFirst().get();
        assertThat(tokens.upgrade.in).as("the fork's view names the cards in").contains("Doubling Season").hasSize(5);

        DeckCardLists base = campaigns.deck(ghave.deck);
        assertThat(count(base)).isEqualTo(100);

        Map<String, String> done = new HashMap<>();
        done.put("ghave-1", "");
        done.put("ghave-fork-1", "tokens");
        DeckCardLists upgraded = campaigns.upgraded(campaigns.deck(ghave.deck), ghave, done);
        assertThat(count(upgraded)).as("still a hundred cards").isEqualTo(100);
        assertThat(names(upgraded)).contains("Doubling Season", "Avenger of Zendikar").doesNotContain("Spawnwrithe", "Monk Realist");

        // nothing taken: the precon as printed
        assertThat(names(campaigns.upgraded(campaigns.deck(ghave.deck), ghave, new HashMap<>()))).contains("Spawnwrithe");
    }
}
