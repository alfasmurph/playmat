package playmat.launcher;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.SocketException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** This computer's addresses, for the "friends can join at" line and the server's allowed origins. */
final class Network {

    private Network() {
    }

    /** IPv4 addresses other devices on the local network can probably reach, best guess first. */
    static List<String> lanAddresses() {
        List<String> preferred = new ArrayList<>();
        List<String> others = new ArrayList<>();
        try {
            for (NetworkInterface nic : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nic.isUp() || nic.isLoopback() || nic.isVirtual() || nic.isPointToPoint()) {
                    continue;
                }
                String name = (nic.getName() + " " + nic.getDisplayName()).toLowerCase(Locale.ENGLISH);
                // Docker, WSL, VirtualBox, VMware and VPN adapters aren't where friends are
                boolean virtual = name.matches(".*(docker|veth|br-|vbox|virtualbox|vmware|vmnet|hyper-v|vethernet|wsl|tun|tap|utun|zerotier|tailscale|wireguard).*");
                for (InetAddress address : Collections.list(nic.getInetAddresses())) {
                    if (address instanceof Inet4Address && !address.isLoopbackAddress() && !address.isLinkLocalAddress()) {
                        String ip = address.getHostAddress();
                        if (!virtual && address.isSiteLocalAddress()) {
                            preferred.add(ip);
                        } else {
                            others.add(ip);
                        }
                    }
                }
            }
        } catch (SocketException e) {
            Log.warn("Can't list network interfaces: " + e.getMessage());
        }
        preferred.addAll(others);
        return preferred;
    }

    /**
     * Tailscale addresses (100.64.0.0/10) on any interface, point-to-point ones included, so friends on a shared
     * tailnet can open the client at this computer's 100.x address.
     */
    static List<String> tailnetAddresses() {
        List<String> addresses = new ArrayList<>();
        try {
            for (NetworkInterface nic : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nic.isUp()) {
                    continue;
                }
                for (InetAddress address : Collections.list(nic.getInetAddresses())) {
                    byte[] b = address.getAddress();
                    if (address instanceof Inet4Address && (b[0] & 0xff) == 100 && (b[1] & 0xc0) == 64) {
                        addresses.add(address.getHostAddress());
                    }
                }
            }
        } catch (SocketException e) {
            Log.warn("Can't list network interfaces: " + e.getMessage());
        }
        return addresses;
    }

    /** Browser origins of the pages this launcher serves. */
    static List<String> origins(int port) {
        Set<String> hosts = new LinkedHashSet<>();
        hosts.add("localhost");
        hosts.add("127.0.0.1");
        hosts.addAll(lanAddresses());
        hosts.addAll(tailnetAddresses());
        try {
            String host = InetAddress.getLocalHost().getHostName().toLowerCase(Locale.ENGLISH);
            if (!host.isEmpty() && !host.equals("localhost")) {
                hosts.add(host);
                if (!host.contains(".")) {
                    hosts.add(host + ".local");
                    hosts.add(host + ".lan");
                    hosts.add(host + ".home");
                }
            }
        } catch (IOException e) {
            // no host name: addresses only
        }
        List<String> origins = new ArrayList<>();
        for (String host : hosts) {
            origins.add("http://" + host + ":" + port);
        }
        // Tailscale Serve or Funnel publishes the client at this computer's tailnet name, over HTTPS on 443
        String tailnetName = tailnetName();
        if (!tailnetName.isEmpty()) {
            origins.add("https://" + tailnetName);
        }
        return origins;
    }

    private static final String[] TAILSCALE_CLI = {
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale", "/usr/bin/tailscale",
    };
    private static final Pattern SELF_DNS_NAME = Pattern.compile("\"Self\"\\s*:\\s*\\{.*?\"DNSName\"\\s*:\\s*\"([^\"]*)\"", Pattern.DOTALL);

    /** This computer's name on its tailnet (e.g. "mac.tail1234.ts.net"), or empty without Tailscale. */
    static String tailnetName() {
        Matcher match = SELF_DNS_NAME.matcher(tailscale("status", "--json"));
        if (!match.find()) {
            return "";
        }
        String name = match.group(1).toLowerCase(Locale.ENGLISH);
        return name.endsWith(".") ? name.substring(0, name.length() - 1) : name;
    }

    /**
     * The client's address on the internet when Tailscale Funnel publishes this computer's HTTPS port
     * ("https://mac.tail1234.ts.net"), or empty: what links people share should point at.
     */
    static String funnelOrigin() {
        String name = tailnetName();
        if (name.isEmpty()) {
            return "";
        }
        Pattern on = Pattern.compile("\"AllowFunnel\"\\s*:\\s*\\{[^}]*\"" + Pattern.quote(name) + ":443\"\\s*:\\s*true");
        return on.matcher(tailscale("funnel", "status", "--json")).find() ? "https://" + name : "";
    }

    /** What the Tailscale command line prints for these arguments, or empty without Tailscale. */
    private static String tailscale(String... args) {
        for (String cli : TAILSCALE_CLI) {
            if (!new java.io.File(cli).canExecute()) {
                continue;
            }
            List<String> command = new ArrayList<>();
            command.add(cli);
            command.addAll(java.util.Arrays.asList(args));
            try {
                Process process = new ProcessBuilder(command).redirectErrorStream(false).start();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                try (InputStream in = process.getInputStream()) {
                    in.transferTo(out);
                }
                if (!process.waitFor(3, TimeUnit.SECONDS)) {
                    process.destroyForcibly();
                    return "";
                }
                return out.toString(java.nio.charset.StandardCharsets.UTF_8);
            } catch (IOException e) {
                Log.warn("Can't ask Tailscale (" + String.join(" ", args) + "): " + e.getMessage());
                return "";
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return "";
            }
        }
        return "";
    }

    /** True when nothing else listens on the port (on any interface). */
    static boolean isFree(int port) {
        try (ServerSocket socket = new ServerSocket()) {
            // connections of a server that just stopped may linger in TIME_WAIT; they don't block a new listener
            socket.setReuseAddress(true);
            socket.bind(new java.net.InetSocketAddress(port));
            return true;
        } catch (IOException e) {
            return false;
        }
    }
}
