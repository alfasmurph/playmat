package mage.server.game;

import mage.Mana;
import mage.abilities.mana.ActivatedManaAbilityImpl;
import mage.constants.Zone;
import mage.game.Game;
import mage.game.events.GameEvent;
import mage.game.events.ManaEvent;
import mage.game.events.TappedForManaEvent;
import mage.game.permanent.Permanent;
import mage.players.Player;
import org.apache.log4j.Logger;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The extra mana each of a player's untapped sources makes when tapped, beyond its own: Forsaken Monument's {C} for
 * a permanent tapped for {C}, Kinnan's one more for a nonland permanent, Mana Reflection's doubling. Worked out the way
 * the engine works out available mana: on a copy of the game made for that, each source's tap is fired as an event,
 * replacement effects change the mana and triggered mana abilities report what they would add.
 */
final class ManaBonus {

    private static final Logger logger = Logger.getLogger(ManaBonus.class);

    private ManaBonus() {
    }

    /** permanent id to its extra mana (only sources with some); empty when it can't be worked out */
    static Map<String, Integer> of(Game game, UUID playerId) {
        Map<String, Integer> bonus = new HashMap<>();
        try {
            Game sim = game.createSimulationForPlayableCalc();
            Player player = sim.getPlayer(playerId);
            if (player == null) {
                return bonus;
            }
            for (Permanent permanent : sim.getBattlefield().getAllActivePermanents(playerId)) {
                if (permanent.isTapped()) {
                    continue;
                }
                int best = 0;
                for (ActivatedManaAbilityImpl ability : permanent.getAbilities(sim)
                        .getAvailableActivatedManaAbilities(Zone.BATTLEFIELD, playerId, sim)) {
                    if (!ability.hasTapCost()) {
                        continue;
                    }
                    for (Mana base : ability.getNetMana(sim)) {
                        best = Math.max(best, extraFor(sim, player, ability, base));
                    }
                }
                if (best > 0) {
                    bonus.put(permanent.getId().toString(), best);
                }
            }
            player.getAvailableTriggeredMana().clear();
        } catch (RuntimeException e) {
            logger.debug("Mana bonus not worked out", e);
            bonus.clear();
        }
        return bonus;
    }

    /** what tapping for `base` adds on top of it, as ManaOptions simulates a tap */
    private static int extraFor(Game sim, Player player, ActivatedManaAbilityImpl ability, Mana base) {
        player.getAvailableTriggeredMana().clear();
        Mana mana = base.copy();
        ManaEvent tapped = new TappedForManaEvent(ability.getSourceId(), ability, ability.getControllerId(), mana, sim);
        if (sim.replaceEvent(tapped)) {
            return 0;
        }
        sim.fireEvent(tapped);
        ManaEvent added = new ManaEvent(GameEvent.EventType.MANA_ADDED, ability.getSourceId(), ability, ability.getControllerId(), mana);
        added.setData(mana.toString());
        sim.fireEvent(added);
        int extra = Math.max(0, tapped.getMana().count() - base.count());
        // each trigger offers its choices of mana; the most of each counts
        for (List<Mana> choices : player.getAvailableTriggeredMana()) {
            extra += choices.stream().mapToInt(Mana::count).max().orElse(0);
        }
        player.getAvailableTriggeredMana().clear();
        return extra;
    }
}
