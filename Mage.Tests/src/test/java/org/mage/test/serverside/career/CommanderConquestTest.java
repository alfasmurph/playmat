package org.mage.test.serverside.career;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import mage.cards.decks.Deck;
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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Commander Conquest (built by Mage.Web.Client/scripts/build-commander-campaigns.mjs from the client's precons): every
 * deck it seats is a legal Commander deck of 99 cards and a commander, with the printings its file names, and every
 * deck copied for it is one a chapter uses. A deck that fails is named in the failure, never left out quietly.
 */
public class CommanderConquestTest {

    private static final String CAMPAIGN = "commander-conquest";
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

    /** every deck file a chapter seats, in order */
    private static Set<String> seatedDecks() throws IOException {
        Set<String> files = new LinkedHashSet<>();
        for (JsonElement chapterElement : campaign().getAsJsonArray("chapters")) {
            for (JsonElement nodeElement : chapterElement.getAsJsonObject().getAsJsonArray("nodes")) {
                JsonObject node = nodeElement.getAsJsonObject();
                files.add(string(node.getAsJsonObject("opponent"), "deck"));
                if (node.has("opponents")) {
                    node.getAsJsonArray("opponents").forEach(seat -> files.add(string(seat.getAsJsonObject(), "deck")));
                }
            }
        }
        return files;
    }

    @Test
    public void theCampaignIsListedAndShaped() throws IOException {
        Path index = CareerDeckTool.careerRoot().resolve("campaigns").resolve("index.json");
        JsonArray ids = JsonParser.parseString(new String(Files.readAllBytes(index), StandardCharsets.UTF_8)).getAsJsonArray();
        List<String> order = new ArrayList<>();
        ids.forEach(id -> order.add(id.getAsString()));
        Assert.assertEquals("listed right after The Commander's Road", order.indexOf("commander-road") + 1, order.indexOf(CAMPAIGN));

        JsonObject campaign = campaign();
        Assert.assertEquals(CAMPAIGN, string(campaign, "id"));
        Assert.assertFalse("a story campaign, not a school", campaign.has("school"));
        Assert.assertTrue("the player brings their own deck", campaign.get("ownDeck").getAsBoolean());
        Assert.assertEquals(COMMANDER, string(campaign, "deckType"));
        Assert.assertEquals("Commander Two Player Duel", string(campaign, "gameType"));
        JsonArray chapters = campaign.getAsJsonArray("chapters");
        Assert.assertEquals("a chapter per precon set, the small ones folded together", 20, chapters.size());
        Set<String> nodeIds = new HashSet<>();
        for (JsonElement chapterElement : chapters) {
            JsonObject chapter = chapterElement.getAsJsonObject();
            String where = string(chapter, "id");
            Assert.assertNull(where + " has no deck of its own", string(chapter, "deck"));
            JsonArray nodes = chapter.getAsJsonArray("nodes");
            int duels = 0;
            int pods = 0;
            for (int i = 0; i < nodes.size(); i++) {
                JsonObject node = nodes.get(i).getAsJsonObject();
                String id = string(node, "id");
                Assert.assertTrue("unique node " + id, nodeIds.add(id));
                Assert.assertEquals(id, "duel", string(node, "type"));
                int seats = 1 + (node.has("opponents") ? node.getAsJsonArray("opponents").size() : 0);
                boolean last = i == nodes.size() - 1;
                if (last) {
                    Assert.assertTrue(id + " is the boss", node.get("boss").getAsBoolean());
                    Assert.assertEquals(id + ": four players", 3, seats);
                    Assert.assertEquals(id, 120, node.getAsJsonObject("reward").get("coins").getAsInt());
                } else if (seats == 2) {
                    pods++;
                } else {
                    Assert.assertEquals(id + " is a duel", 1, seats);
                    Assert.assertEquals(id + " opens with the chapter", 0, node.getAsJsonArray("requires").size());
                    duels++;
                }
                if (seats > 1) {
                    Assert.assertEquals(id, "Commander Free For All", string(node, "gameType"));
                }
            }
            Assert.assertTrue(where + ": a duel with each of its decks", duels >= 3);
            Assert.assertTrue(where + ": one or two pods", pods >= 1 && pods <= 2);
        }
    }

    @Test
    public void everyCopiedDeckIsSeated() throws IOException {
        Set<String> seated = seatedDecks();
        Path root = decks().resolve(CAMPAIGN);
        List<String> copied;
        try (Stream<Path> walk = Files.walk(root)) {
            copied = walk.filter(Files::isRegularFile).map(file -> CAMPAIGN + "/" + root.relativize(file).toString().replace('\\', '/'))
                    .sorted().collect(Collectors.toList());
        }
        List<String> unused = copied.stream().filter(file -> !seated.contains(file)).collect(Collectors.toList());
        Assert.assertEquals("deck files no chapter seats", new ArrayList<>(), unused);
        Assert.assertEquals("every precon in the client's index but none twice", copied.size(), seated.size());
    }

    @Test
    public void everyDeckIsALegalCommanderDeckWithRealPrintings() throws IOException {
        DeckValidator validator = CareerDeckTool.validator(COMMANDER);
        Assert.assertNotNull("Commander validator from config.xml", validator);
        int checked = 0;
        for (String file : seatedDecks()) {
            Path path = decks().resolve(file);
            if (!Files.isRegularFile(path)) {
                problems.add("missing deck file " + file);
                continue;
            }
            for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
                Matcher matcher = DCK_LINE.matcher(line.trim());
                if (!matcher.matches()) {
                    continue;
                }
                CardInfo info = CardRepository.instance.findCard(matcher.group(3), matcher.group(4));
                if (info == null || !info.getName().equals(matcher.group(5).trim())) {
                    problems.add(file + ": no printing " + matcher.group(3) + ":" + matcher.group(4) + " of " + matcher.group(5));
                }
            }
            StringBuilder errors = new StringBuilder();
            DeckCardLists lists = DeckImporter.importDeckFromFile(path.toString(), errors, false);
            if (lists == null || lists.getCards().isEmpty()) {
                problems.add(file + ": can't be read: " + errors);
                continue;
            }
            Deck deck;
            try {
                deck = Deck.load(lists, true, false);
            } catch (Exception e) {
                problems.add(file + ": can't be loaded: " + e.getMessage());
                continue;
            }
            int commanders = deck.getSideboard().size();
            if (deck.getMaindeckCards().size() + commanders != 100 || commanders < 1 || commanders > 2) {
                problems.add(file + ": " + deck.getMaindeckCards().size() + " cards and " + commanders + " commanders");
            }
            if (!validator.validate(deck)) {
                for (DeckValidatorError error : validator.getErrorsListSorted(20)) {
                    problems.add(file + ": " + error.getGroup() + " " + error.getMessage());
                }
            }
            checked++;
        }
        // the client's precon index: 86 decks in 26 sets
        Assert.assertEquals("every precon checked", 86, checked);
        Assert.assertEquals("Conquest decks that aren't legal Commander decks", new ArrayList<>(), problems);
    }
}
