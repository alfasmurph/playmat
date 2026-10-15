package mage.server;

import mage.server.managers.ManagerFactory;
import mage.server.websocket.WebSocketCallbackHandler;
import org.java_websocket.WebSocket;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * An account signs in on a second device: the first connection's session ends (it can't act as the user, and its
 * drop later can't mark the user offline) and its socket closes saying why, so that client doesn't sign back in.
 */
public class SignedInElsewhereTest {

    private static final String PASSWORD = "correct horse 7";

    private final Map<String, Function<Object[], Object>> overrides = new HashMap<>();
    private final Map<String, User> users = new HashMap<>();
    private final Map<String, Session> sessions = new HashMap<>();
    private final List<String> ended = new ArrayList<>();
    private final Map<String, List<Object>> closes = new HashMap<>();
    private AuthorizedUserRepository previousAccounts;
    private ManagerFactory managers;

    @BeforeEach
    void setUp() {
        previousAccounts = AuthorizedUserRepository.getInstance();
        AuthorizedUserRepository accounts = new AuthorizedUserRepository("jdbc:h2:mem:elsewhere-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
        AuthorizedUserRepository.use(accounts);
        accounts.add("alice", PASSWORD, "alice@example.test");

        managers = deepProxy(ManagerFactory.class);
        overrides.put("isAuthenticationActivated", args -> true);
        overrides.put("getMinUserNameLength", args -> 3);
        overrides.put("getMaxUserNameLength", args -> 20);
        overrides.put("createUser", args -> {
            String name = (String) args[0];
            if (users.containsKey(name)) {
                return Optional.empty();
            }
            User user = new User(managers, name, (String) args[1], (AuthorizedUser) args[2]);
            users.put(name, user);
            return Optional.of(user);
        });
        overrides.put("getUserByName", args -> Optional.ofNullable(users.get((String) args[0])));
        overrides.put("connectToSession", args -> {
            users.values().stream().filter(u -> u.getId().equals(args[1])).forEach(u -> u.setSessionId((String) args[0]));
            return true;
        });
        overrides.put("getSession", args -> Optional.ofNullable(sessions.get((String) args[0])));
        overrides.put("disconnect", args -> {
            // the session manager's disconnect (by session id); the user manager's takes the user's id
            if (args[0] instanceof String) {
                ended.add((String) args[0]);
                assertThat(args[2]).as("the user stays connected through the new session").isEqualTo(false);
            }
            return null;
        });
    }

    @AfterEach
    void tearDown() {
        AuthorizedUserRepository.use(previousAccounts);
    }

    @Test
    void theReplacedConnectionEndsAndIsToldWhy() throws Exception {
        Session phone = webSession("phone");
        assertThat(phone.connectUser("alice", PASSWORD, "")).isNull();

        Session laptop = webSession("laptop");
        assertThat(laptop.connectUser("alice", PASSWORD, "")).isNull();

        assertThat(ended).containsExactly("phone");
        assertThat(closes.get("phone")).containsExactly(WebSocketCallbackHandler.CLOSE_SIGNED_IN_ELSEWHERE, "Signed in elsewhere");
        assertThat(closes.get("laptop")).isNull();
        assertThat(users.get("alice").getSessionId()).isEqualTo("laptop");
    }

    @Test
    void signingInAgainOnTheSameConnectionEndsNothing() throws Exception {
        Session phone = webSession("phone");
        assertThat(phone.connectUser("alice", PASSWORD, "")).isNull();
        assertThat(phone.connectUser("alice", PASSWORD, "")).isNull();

        assertThat(ended).isEmpty();
        assertThat(closes).isEmpty();
    }

    private Session webSession(String id) {
        WebSocket socket = (WebSocket) Proxy.newProxyInstance(WebSocket.class.getClassLoader(), new Class<?>[]{WebSocket.class},
                (proxy, method, args) -> {
                    if (method.getName().equals("close") && args != null && args.length == 2) {
                        closes.put(id, Arrays.asList(args[0], args[1]));
                    }
                    return method.getReturnType() == boolean.class ? (Object) true : null;
                });
        Session session = new Session(managers, id, new WebSocketCallbackHandler(socket));
        session.setHost("192.0.2.10");
        sessions.put(id, session);
        return session;
    }

    @SuppressWarnings("unchecked")
    private <T> T deepProxy(Class<T> type) {
        return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (proxy, method, args) -> {
            Function<Object[], Object> override = overrides.get(method.getName());
            if (override != null) {
                return override.apply(args == null ? new Object[0] : args);
            }
            Class<?> result = method.getReturnType();
            if (result == Optional.class) {
                return Optional.empty();
            }
            if (result == boolean.class) {
                return false;
            }
            if (result == int.class || result == long.class) {
                return result == int.class ? (Object) 0 : (Object) 0L;
            }
            if (result.isInterface()) {
                return deepProxy(result);
            }
            return null;
        });
    }
}
