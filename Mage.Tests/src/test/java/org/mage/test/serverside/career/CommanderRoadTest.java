package org.mage.test.serverside.career;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import mage.cards.ExpansionSet;
import mage.cards.Sets;
import mage.cards.decks.Deck;
import mage.cards.decks.DeckCardInfo;
import mage.cards.decks.DeckCardLists;
import mage.cards.decks.DeckValidator;
import mage.cards.decks.DeckValidatorError;
import mage.cards.decks.importer.DeckImporter;
import mage.cards.repository.CardInfo;
import mage.cards.repository.CardRepository;
import mage.cards.repository.CardScanner;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Commander's Road: every chapter's deck is a legal Commander deck as the player plays it, before any fork and
 * after every pick at its two forks (each upgrade pack takes its "out" cards out, one copy each, and puts its own
 * cards in, the way CareerCampaigns.upgraded does), and every deck the campaign names exists with real printings.
 */
public class CommanderRoadTest {

    private static final String CAMPAIGN = "commander-road";
    private static final String COMMANDER = "Variant Magic - Commander";
    private static final Pattern DCK_LINE = Pattern.compile("^(SB:\\s*)?(\\d+)\\s+\\[([^:\\]]+):([^\\]]+)]\\s+(.+)$");

    private final List<String> problems = new ArrayList<>();

    @Before
    public void setUp() {
        CardScanner.scan();
    }

    private static Path decks() {
        return CareerDeckTool.careerRoot().resolve("campaigns").resolve("decks");
    }

    private static JsonObject campaign() throws IOException {
        Path file = CareerDeckTool.careerRoot().resolve("campaigns").resolve(CAMPAIGN + ".json");
        return JsonParser.parseString(new String(Files.readAllBytes(file), StandardCharsets.UTF_8)).getAsJsonObject();
    }

    private static String string(JsonObject object, String field) {
        return object.has(field) && !object.get(field).isJsonNull() ? object.get(field).getAsString() : null;
    }

    @Test
    public void theCampaignIsListedAndShaped() throws IOException {
        Path index = CareerDeckTool.careerRoot().resolve("campaigns").resolve("index.json");
        JsonArray ids = JsonParser.parseString(new String(Files.readAllBytes(index), StandardCharsets.UTF_8)).getAsJsonArray();
        List<String> order = new ArrayList<>();
        ids.forEach(id -> order.add(id.getAsString()));
        Assert.assertEquals("listed right after the Commander school", order.indexOf("commander") + 1, order.indexOf(CAMPAIGN));

        JsonObject campaign = campaign();
        Assert.assertEquals(CAMPAIGN, string(campaign, "id"));
        Assert.assertFalse("a story campaign, not a school", campaign.has("school"));
        Assert.assertFalse("open as soon as Career is", campaign.has("requires"));
        Assert.assertEquals(COMMANDER, string(campaign, "deckType"));
        Assert.assertEquals("Commander Two Player Duel", string(campaign, "gameType"));
        JsonArray chapters = campaign.getAsJsonArray("chapters");
        Assert.assertEquals(5, chapters.size());
        Set<String> nodeIds = new HashSet<>();
        for (JsonElement chapterElement : chapters) {
            JsonObject chapter = chapterElement.getAsJsonObject();
            String where = string(chapter, "id");
            JsonArray nodes = chapter.getAsJsonArray("nodes");
            Assert.assertEquals(where + " has seven nodes", 7, nodes.size());
            String[] types = {"duel", "duel", "choice", "duel", "duel", "choice", "duel"};
            int[] seats = {1, 1, 0, 2, 2, 0, 3};
            String previous = null;
            for (int i = 0; i < nodes.size(); i++) {
                JsonObject node = nodes.get(i).getAsJsonObject();
                String id = string(node, "id");
                Assert.assertTrue("unique node " + id, nodeIds.add(id));
                Assert.assertEquals(id, types[i], string(node, "type"));
                JsonArray requires = node.getAsJsonArray("requires");
                if (previous == null) {
                    Assert.assertEquals(id + " opens with the chapter", 0, requires.size());
                } else {
                    Assert.assertEquals(id + " requires the node before it", previous, requires.get(0).getAsString());
                }
                previous = id;
                if ("choice".equals(types[i])) {
                    JsonArray options = node.getAsJsonArray("options");
                    Assert.assertEquals(id + " offers three packs", 3, options.size());
                    for (JsonElement option : options) {
                        JsonObject upgrade = option.getAsJsonObject().getAsJsonObject("upgrade");
                        Assert.assertNotNull(id + " options are upgrade packs", upgrade);
                        Assert.assertEquals(id + " packs swap five cards", 5, upgrade.getAsJsonArray("out").size());
                        Assert.assertEquals(id + " pays a wildcard", i == 2 ? "uncommon" : "rare",
                                string(option.getAsJsonObject().getAsJsonObject("reward"), "wildcard"));
                    }
                    continue;
                }
                int others = node.has("opponents") ? node.getAsJsonArray("opponents").size() : 0;
                Assert.assertEquals(id + " seats", seats[i], 1 + others);
                if (others > 0) {
                    Assert.assertEquals(id, "Commander Free For All", string(node, "gameType"));
                }
                Assert.assertNotNull(id + " before", string(node, "before"));
                Assert.assertNotNull(id + " after", string(node, "after"));
            }
            JsonObject boss = nodes.get(6).getAsJsonObject();
            Assert.assertTrue(where + " ends with its boss", boss.get("boss").getAsBoolean());
            JsonObject twists = boss.getAsJsonObject("opponent").getAsJsonObject("twists");
            Assert.assertEquals(50, twists.get("startingLife").getAsInt());
            Assert.assertEquals(1, twists.get("extraCards").getAsInt());
            String set = string(chapter, "unlockSet");
            ExpansionSet expansion = set == null ? null : Sets.findSet(set);
            Assert.assertTrue(where + " opens a set with packs: " + set, expansion != null && expansion.hasBoosters());
            Assert.assertEquals(where + " boss opens the chapter's set", set, string(boss.getAsJsonObject("reward"), "unlockSet"));
        }
    }

    @Test
    public void everyDeckFileExistsWithRealPrintings() throws IOException {
        Set<String> files = new HashSet<>();
        for (JsonElement chapterElement : campaign().getAsJsonArray("chapters")) {
            JsonObject chapter = chapterElement.getAsJsonObject();
            files.add(string(chapter, "deck"));
            for (JsonElement nodeElement : chapter.getAsJsonArray("nodes")) {
                JsonObject node = nodeElement.getAsJsonObject();
                if (node.has("opponent")) {
                    files.add(string(node.getAsJsonObject("opponent"), "deck"));
                }
                if (node.has("opponents")) {
                    node.getAsJsonArray("opponents").forEach(seat -> files.add(string(seat.getAsJsonObject(), "deck")));
                }
                if (node.has("options")) {
                    node.getAsJsonArray("options").forEach(option -> files.add(string(option.getAsJsonObject().getAsJsonObject("upgrade"), "deck")));
                }
            }
        }
        for (String file : files) {
            Path path = decks().resolve(file);
            if (!Files.isRegularFile(path)) {
                problems.add("missing deck file " + file);
                continue;
            }
            int cards = 0;
            for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
                Matcher matcher = DCK_LINE.matcher(line.trim());
                if (!matcher.matches()) {
                    continue;
                }
                cards++;
                CardInfo info = CardRepository.instance.findCard(matcher.group(3), matcher.group(4));
                if (info == null || !info.getName().equals(matcher.group(5).trim())) {
                    problems.add(file + ": no printing " + matcher.group(3) + ":" + matcher.group(4) + " of " + matcher.group(5));
                }
            }
            if (cards == 0) {
                problems.add(file + ": no cards");
            }
        }
        Assert.assertEquals("5 player decks, 20 opponent precons, 30 upgrade packs", 55, files.size());
        Assert.assertEquals("deck files", new ArrayList<>(), problems);
    }

    @Test
    public void everyForkPathIsALegalCommanderDeck() throws IOException {
        DeckValidator validator = CareerDeckTool.validator(COMMANDER);
        Assert.assertNotNull("Commander validator from config.xml", validator);
        int checked = 0;
        for (JsonElement chapterElement : campaign().getAsJsonArray("chapters")) {
            JsonObject chapter = chapterElement.getAsJsonObject();
            String where = string(chapter, "id");
            List<JsonArray> forks = new ArrayList<>();
            for (JsonElement nodeElement : chapter.getAsJsonArray("nodes")) {
                JsonObject node = nodeElement.getAsJsonObject();
                if ("choice".equals(string(node, "type"))) {
                    forks.add(node.getAsJsonArray("options"));
                }
            }
            Assert.assertEquals(where + " has two forks", 2, forks.size());
            String base = string(chapter, "deck");
            String commander = commanderOf(read(base));
            checkOpponents(chapter, commander);

            validate(validator, where + " (no packs)", read(base));
            checked++;
            for (JsonElement first : forks.get(0)) {
                JsonObject firstOption = first.getAsJsonObject();
                // the pods between the forks play with the first pack only
                DeckCardLists one = read(base);
                apply(where, one, firstOption);
                validate(validator, where + " + " + string(firstOption, "id"), one);
                checked++;
                for (JsonElement second : forks.get(1)) {
                    JsonObject secondOption = second.getAsJsonObject();
                    DeckCardLists both = read(base);
                    apply(where, both, firstOption);
                    apply(where, both, secondOption);
                    validate(validator, where + " + " + string(firstOption, "id") + " + " + string(secondOption, "id"), both);
                    checked++;
                }
            }
        }
        Assert.assertEquals("5 chapters x (base + 3 first packs + 9 pairs)", 5 * 13, checked);
        Assert.assertEquals("decks that aren't legal on the road", new ArrayList<>(), problems);
    }

    /** no opponent at a chapter's tables plays the player's own commander */
    private void checkOpponents(JsonObject chapter, String commander) throws IOException {
        for (JsonElement nodeElement : chapter.getAsJsonArray("nodes")) {
            JsonObject node = nodeElement.getAsJsonObject();
            List<JsonObject> seats = new ArrayList<>();
            if (node.has("opponent")) {
                seats.add(node.getAsJsonObject("opponent"));
            }
            if (node.has("opponents")) {
                node.getAsJsonArray("opponents").forEach(seat -> seats.add(seat.getAsJsonObject()));
            }
            for (JsonObject seat : seats) {
                if (commander.equals(commanderOf(read(string(seat, "deck"))))) {
                    problems.add(string(node, "id") + ": " + string(seat, "name") + " plays the player's commander " + commander);
                }
            }
        }
    }

    private static String commanderOf(DeckCardLists deck) {
        return deck.getSideboard().isEmpty() ? "" : deck.getSideboard().get(0).getCardName();
    }

    private static DeckCardLists read(String file) throws IOException {
        StringBuilder errors = new StringBuilder();
        DeckCardLists lists = DeckImporter.importDeckFromFile(decks().resolve(file).toString(), errors, false);
        if (lists == null || lists.getCards().isEmpty()) {
            throw new IOException(file + " can't be read: " + errors);
        }
        return lists;
    }

    /** CareerCampaigns.upgraded: each "out" name loses one copy (asserted present here), then the pack's cards go in */
    private void apply(String where, DeckCardLists deck, JsonObject option) throws IOException {
        JsonObject upgrade = option.getAsJsonObject("upgrade");
        for (JsonElement out : upgrade.getAsJsonArray("out")) {
            if (!takeOut(deck.getCards(), out.getAsString())) {
                problems.add(where + "/" + string(option, "id") + ": " + out.getAsString() + " isn't in the deck to take out");
            }
        }
        for (DeckCardInfo card : read(string(upgrade, "deck")).getCards()) {
            deck.getCards().add(card.copy());
        }
    }

    private static boolean takeOut(List<DeckCardInfo> cards, String name) {
        for (int i = 0; i < cards.size(); i++) {
            DeckCardInfo card = cards.get(i);
            if (card.getCardName().equalsIgnoreCase(name)) {
                if (card.getAmount() > 1) {
                    cards.set(i, new DeckCardInfo(card.getCardName(), card.getCardNumber(), card.getSetCode(), card.getAmount() - 1));
                } else {
                    cards.remove(i);
                }
                return true;
            }
        }
        return false;
    }

    private void validate(DeckValidator validator, String what, DeckCardLists lists) {
        Deck deck;
        try {
            deck = Deck.load(lists, true, false);
        } catch (Exception e) {
            problems.add(what + ": can't be loaded: " + e.getMessage());
            return;
        }
        if (deck.getMaindeckCards().size() != 99 || deck.getSideboard().size() != 1) {
            problems.add(what + ": " + deck.getMaindeckCards().size() + " cards and " + deck.getSideboard().size() + " commander");
        }
        if (!validator.validate(deck)) {
            for (DeckValidatorError error : validator.getErrorsListSorted(20)) {
                problems.add(what + ": " + error.getGroup() + " " + error.getMessage());
            }
        }
    }
}
