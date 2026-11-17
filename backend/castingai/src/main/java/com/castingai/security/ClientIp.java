package com.castingai.security;

import jakarta.servlet.http.HttpServletRequest;

import java.util.regex.Pattern;

/**
 * T-126 · Adresse IP du visiteur pour les limites anti-abus.
 * Derrière le tunnel Cloudflare et le relais local du site, toutes les requêtes arrivent de 127.0.0.1 :
 * on lit alors l'adresse transmise par Cloudflare. Ces en-têtes ne sont crus que si la requête vient
 * de la machine elle-même ; venant d'ailleurs, ils sont ignorés (personne ne peut se faire passer pour un autre).
 */
public final class ClientIp {

    private static final Pattern SAFE = Pattern.compile("^[0-9a-fA-F:.]{2,45}$");

    private ClientIp() {}

    public static String of(HttpServletRequest req) {
        String remote = req.getRemoteAddr();
        if (!isLoopback(remote)) return remote;
        String cf = req.getHeader("CF-Connecting-IP");
        if (cf != null && SAFE.matcher(cf.trim()).matches()) return cf.trim();
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null) {
            String first = xff.split(",")[0].trim();
            if (SAFE.matcher(first).matches()) return first;
        }
        return remote;
    }

    private static boolean isLoopback(String ip) {
        return ip != null && (ip.equals("127.0.0.1") || ip.equals("::1") || ip.equals("0:0:0:0:0:0:0:1"));
    }
}
