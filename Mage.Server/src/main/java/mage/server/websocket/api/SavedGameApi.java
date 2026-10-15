package mage.server.websocket.api;

import mage.game.GameException;
import mage.server.Session;
import mage.server.TableController;
import mage.server.career.CareerService;
import mage.server.savedgame.SavedGameEntry;
import mage.server.savedgame.SavedGames;
import mage.server.util.PluginUtil;
import mage.server.websocket.rpc.RpcCall;
import mage.server.websocket.rpc.RpcException;
import mage.server.websocket.rpc.RpcMethod;
import mage.view.TableView;
import org.apache.log4j.Logger;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import static mage.server.websocket.rpc.RpcParam.Type.STRING;
import static mage.server.websocket.rpc.RpcParam.of;

/**
 * Web client bridge: games against the AI saved at every turn's start (SavedGames), to play on after a server restart
 * or after leaving without conceding.
 */
final class SavedGameApi {

    private static final Logger logger = Logger.getLogger(SavedGameApi.class);

    private SavedGameApi() {
    }

    static List<RpcMethod> methods(ApiContext ctx) {
        return Arrays.asList(
                RpcMethod.named("savedGameList")
                        .returns("SavedGameEntry[]")
                        .doc("The signed-in player's saved games against the AI that aren't being played right now, newest first "
                                + "(at most " + SavedGames.MAX_PER_PLAYER + "). A game is saved at the start of every turn and "
                                + "forgotten when it ends.")
                        .handler(call -> {
                            String user = userName(ctx, call);
                            return SavedGames.get().list(user).stream()
                                    .filter(info -> !running(ctx, info.gameId))
                                    .map(SavedGameEntry::of)
                                    .collect(Collectors.toList());
                        }),

                RpcMethod.named("savedGameResume")
                        .params(of("gameId", STRING))
                        .returns("string")
                        .doc("Plays a saved game on from the start of the turn it was saved at: the server sets up a table with "
                                + "the same players and starts it; the game arrives like any other. Returns the table id.")
                        .handler(call -> resume(ctx, call)),

                RpcMethod.named("savedGameDelete")
                        .params(of("gameId", STRING))
                        .returns("boolean")
                        .doc("Throws a saved game away; false when the player has no such game.")
                        .handler(call -> SavedGames.get().removeOwned(call.string(0), userName(ctx, call)))
        );
    }

    private static String resume(ApiContext ctx, RpcCall call) throws RpcException {
        String user = userName(ctx, call);
        String gameId = call.string(0);
        if (running(ctx, gameId)) {
            throw RpcException.invalidParams("That game is still going: open it from your games.");
        }
        SavedGames.Saved saved;
        try {
            saved = SavedGames.get().load(gameId, user, PluginUtil.classLoader);
        } catch (IOException e) {
            throw RpcException.invalidParams(e.getMessage());
        }
        String sessionId = call.sessionId();
        UUID userId = ctx.managers.sessionManager().getSession(sessionId).map(Session::getUserId)
                .orElseThrow(() -> RpcException.notAuthorized("Sign in first"));
        UUID roomId = ctx.managers.gamesRoomManager().getMainRoomId();
        UUID tableId = null;
        try {
            TableView table = ctx.server.roomCreateTable(sessionId, roomId, saved.options);
            tableId = table.getTableId();
            if (saved.info.careerKind != null) {
                // a Career game pays and ends at its new table as it would have at the old one
                CareerService.get().registerAgain(tableId, user, saved.info.careerOpponentId, saved.info.careerTier,
                        saved.info.careerKind, saved.info.careerRef, (mage.server.career.CareerSetup) saved.info.careerSetup);
            }
            Optional<TableController> controller = ctx.managers.tableManager().getController(tableId);
            if (!controller.isPresent()) {
                throw new RpcException(RpcException.SERVER_ERROR, "The table couldn't be set up.");
            }
            controller.get().seatSavedGame(userId, saved);
            if (!ctx.server.matchStart(sessionId, roomId, tableId)) {
                throw new RpcException(RpcException.SERVER_ERROR, "The game couldn't start.");
            }
            return tableId.toString();
        } catch (RpcException e) {
            abandon(ctx, sessionId, roomId, tableId);
            throw e;
        } catch (GameException e) {
            abandon(ctx, sessionId, roomId, tableId);
            throw RpcException.invalidParams(e.getMessage());
        } catch (Exception e) {
            abandon(ctx, sessionId, roomId, tableId);
            logger.warn("Saved game " + gameId + " couldn't be played on", e);
            throw new RpcException(RpcException.SERVER_ERROR, "The saved game couldn't be played on", e);
        }
    }

    private static boolean running(ApiContext ctx, String gameId) {
        try {
            return ctx.managers.gameManager().getGameController().containsKey(UUID.fromString(gameId));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static String userName(ApiContext ctx, RpcCall call) throws RpcException {
        return ctx.sessions.userName(call.sessionId()).orElseThrow(() -> RpcException.notAuthorized("Sign in first"));
    }

    private static void abandon(ApiContext ctx, String sessionId, UUID roomId, UUID tableId) {
        if (tableId == null) {
            return;
        }
        CareerService.get().forget(tableId);
        try {
            ctx.server.tableRemove(sessionId, roomId, tableId);
        } catch (Exception e) {
            logger.warn("Saved game: an unfinished table couldn't be removed", e);
        }
    }
}
