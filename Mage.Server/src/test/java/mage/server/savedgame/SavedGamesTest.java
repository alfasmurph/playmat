package mage.server.savedgame;

import mage.game.match.MatchOptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Games against the AI saved at every turn's start: listed per player, newest first, kept only to a few. */
public class SavedGamesTest {

    @TempDir
    Path dir;

    private SavedGames.Info info(String owner, int turn, long savedAt) {
        SavedGames.Info info = new SavedGames.Info();
        info.gameId = UUID.randomUUID().toString();
        info.owner = owner;
        info.title = owner + " vs AI";
        info.turn = turn;
        info.savedAt = savedAt;
        info.opponents.add("AI Opponent");
        return info;
    }

    private void save(SavedGames games, SavedGames.Info info) {
        games.write(info, new MatchOptions(info.title, "Two Player Duel", false), new ArrayList<>(), "a game");
    }

    @Test
    void eachPlayerSeesOnlyTheirOwnGamesNewestFirst() {
        SavedGames games = new SavedGames(dir);
        SavedGames.Info older = info("alice", 3, 1000);
        SavedGames.Info newer = info("alice", 7, 2000);
        save(games, older);
        save(games, newer);
        save(games, info("bob", 2, 3000));

        List<SavedGames.Info> mine = games.list("Alice");
        assertThat(mine).extracting(found -> found.gameId).containsExactly(newer.gameId, older.gameId);
        assertThat(mine.get(0).turn).isEqualTo(7);
        assertThat(mine.get(0).opponents).containsExactly("AI Opponent");
        assertThat(games.list("carol")).isEmpty();
    }

    @Test
    void aLaterSaveOfTheSameGameReplacesTheEarlierOne() {
        SavedGames games = new SavedGames(dir);
        SavedGames.Info first = info("alice", 3, 1000);
        save(games, first);
        first.turn = 5;
        first.savedAt = 2000;
        save(games, first);

        assertThat(games.list("alice")).extracting(found -> found.turn).containsExactly(5);
    }

    @Test
    void onlyTheOwnerLoadsOrThrowsAGameAway() {
        SavedGames games = new SavedGames(dir);
        SavedGames.Info game = info("alice", 3, 1000);
        save(games, game);

        assertThatThrownBy(() -> games.load(game.gameId, "bob", getClass().getClassLoader()))
                .isInstanceOf(IOException.class).hasMessageContaining("isn't yours");
        assertThat(games.removeOwned(game.gameId, "bob")).isFalse();
        assertThat(games.list("alice")).hasSize(1);
        assertThat(games.removeOwned(game.gameId, "alice")).isTrue();
        assertThat(games.list("alice")).isEmpty();
        assertThatThrownBy(() -> games.load("../../etc/passwd", "alice", getClass().getClassLoader()))
                .isInstanceOf(IOException.class);
    }

    @Test
    void onlyTheNewestFewAreKept() {
        SavedGames games = new SavedGames(dir);
        for (int i = 0; i < SavedGames.MAX_PER_PLAYER + 3; i++) {
            save(games, info("alice", i + 1, 1000 + i));
        }
        List<Integer> turns = games.list("alice").stream().map(found -> found.turn).collect(Collectors.toList());
        assertThat(turns).hasSize(SavedGames.MAX_PER_PLAYER);
        assertThat(turns.get(0)).isEqualTo(SavedGames.MAX_PER_PLAYER + 3);
    }

    @Test
    void anEndedGameIsForgotten() {
        SavedGames games = new SavedGames(dir);
        SavedGames.Info game = info("alice", 3, 1000);
        save(games, game);
        assertThat(games.remove(game.gameId)).isTrue();
        assertThat(games.list("alice")).isEmpty();
        assertThat(games.remove("not-a-game")).isFalse();
    }
}
