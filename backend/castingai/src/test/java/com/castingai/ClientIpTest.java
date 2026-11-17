package com.castingai;

import com.castingai.security.ClientIp;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

/** T-126 · L'adresse transmise par Cloudflare n'est crue que pour une requête venue de la machine elle-même. */
class ClientIpTest {

    private static MockHttpServletRequest req(String remote, String cf, String xff) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.setRemoteAddr(remote);
        if (cf != null) r.addHeader("CF-Connecting-IP", cf);
        if (xff != null) r.addHeader("X-Forwarded-For", xff);
        return r;
    }

    @Test
    void tunnelLocalUtiliseLAdresseCloudflare() {
        assertThat(ClientIp.of(req("127.0.0.1", "41.226.10.5", "10.0.0.1"))).isEqualTo("41.226.10.5");
        assertThat(ClientIp.of(req("::1", null, "41.226.10.6, 172.16.0.1"))).isEqualTo("41.226.10.6");
        assertThat(ClientIp.of(req("127.0.0.1", null, null))).isEqualTo("127.0.0.1");
    }

    @Test
    void requeteExterneIgnoreLesEnTetes() {
        assertThat(ClientIp.of(req("203.0.113.9", "1.2.3.4", "5.6.7.8"))).isEqualTo("203.0.113.9");
    }

    @Test
    void valeurInvalideIgnoree() {
        assertThat(ClientIp.of(req("127.0.0.1", "<script>", "pas une ip"))).isEqualTo("127.0.0.1");
    }
}
