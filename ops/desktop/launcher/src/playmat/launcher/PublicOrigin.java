package playmat.launcher;

import java.util.function.Supplier;

/**
 * Where people outside this network reach the client: the publicUrl setting, else the Tailscale Funnel link while
 * Funnel is on. Asked when the page loads; Tailscale is asked at most once a minute, so turning Funnel on or off
 * shows within a minute without a restart.
 */
final class PublicOrigin implements Supplier<String> {

    private static final long FRESH_MILLIS = 60_000;

    private final Settings settings;
    private String origin = "";
    private long checkedAt = Long.MIN_VALUE;

    PublicOrigin(Settings settings) {
        this.settings = settings;
    }

    @Override
    public synchronized String get() {
        String configured = settings.publicUrl();
        if (!configured.isEmpty()) {
            return configured;
        }
        long now = System.currentTimeMillis();
        if (checkedAt == Long.MIN_VALUE || now - checkedAt > FRESH_MILLIS) {
            origin = Network.funnelOrigin();
            checkedAt = now;
        }
        return origin;
    }
}
