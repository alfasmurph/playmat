package playmat.launcher;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/** The few choices a player can make, kept in settings.properties in the data folder. */
final class Settings {

    private final Path file;
    private final Properties values = new Properties();

    Settings(Path file) {
        this.file = file;
        if (Files.isRegularFile(file)) {
            try (InputStream in = Files.newInputStream(file)) {
                values.load(in);
            } catch (IOException e) {
                Log.warn("Can't read " + file + ": " + e.getMessage());
            }
        }
    }

    /** Player accounts: players register with a name and a password. Career needs them. On by default. */
    boolean accounts() {
        return !"false".equalsIgnoreCase(values.getProperty("accounts", "true").trim());
    }

    void setAccounts(boolean on) {
        values.setProperty("accounts", Boolean.toString(on));
        save();
    }

    /** Java heap for the server, e.g. "2g"; empty picks one from the computer's memory. */
    String memory() {
        return values.getProperty("memory", "").trim();
    }

    /**
     * The owner's account name: always let in, owner in the admin console (Access: invite-only, invite links, the
     * allowlist). Empty: no owner.
     */
    String owner() {
        return values.getProperty("owner", "").trim();
    }

    /**
     * Where the client is published for people outside this network ("https://play.example.com"), for the links
     * it shares; empty: the Tailscale Funnel link while Funnel is on.
     */
    String publicUrl() {
        return values.getProperty("publicUrl", "").trim().replaceAll("/+$", "");
    }

    /** More browser origins the server accepts, comma separated (e.g. a domain a tunnel serves the client at). */
    java.util.List<String> extraOrigins() {
        java.util.List<String> origins = new java.util.ArrayList<>();
        for (String origin : values.getProperty("origins", "").split(",")) {
            if (!origin.trim().isEmpty()) {
                origins.add(origin.trim());
            }
        }
        return origins;
    }

    private void save() {
        try (OutputStream out = Files.newOutputStream(file)) {
            values.store(out, "Playmat settings");
        } catch (IOException e) {
            Log.warn("Can't save " + file + ": " + e.getMessage());
        }
    }
}
