package com.castingai;

import com.castingai.config.JwtConfig;
import com.castingai.storage.MediaUrls;
import com.castingai.storage.StorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import java.lang.reflect.Method;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/** T-109 · Liens signés : valables, stables pendant 30 min, refusés s'ils sont modifiés ou expirés. */
class MediaUrlsTest {

    private MediaUrls media;

    @BeforeEach
    void setUp() throws Exception {
        StorageService storage = new StorageService() {
            public String upload(MultipartFile f, String n) { return null; }
            public String uploadBytes(byte[] d, String n, String c) { return null; }
            public void delete(String n) {}
            public byte[] download(String k) { return new byte[0]; }
            public String keyFromUrl(String url) { return url != null && url.startsWith("/casting-media/casting-media/") ? url.substring("/casting-media/casting-media/".length()) : null; }
        };
        JwtConfig jwt = new JwtConfig();
        jwt.setSecret("secret-de-test-assez-long-pour-hmac-0123456789");
        media = new MediaUrls(storage, jwt);
        Method init = MediaUrls.class.getDeclaredMethod("init");
        init.setAccessible(true);
        init.invoke(media);
    }

    private static String[] parts(String signed) {
        String path = signed.substring("/api/media/".length(), signed.indexOf('?'));
        String q = signed.substring(signed.indexOf('?') + 1);
        String e = q.replaceAll(".*e=([0-9]+).*", "$1"), s = q.replaceAll(".*s=([A-Za-z0-9_-]+).*", "$1");
        return new String[] { URLDecoder.decode(path, StandardCharsets.UTF_8), e, s };
    }

    @Test
    void lienSigneValableEtStable() {
        String a = media.sign("/casting-media/casting-media/photos/abc def.jpg");
        assertThat(a).startsWith("/api/media/photos/abc%20def.jpg?e=");
        assertThat(media.sign("/casting-media/casting-media/photos/abc def.jpg")).isEqualTo(a);     // même lien : cache du navigateur
        String[] p = parts(a);
        assertThat(p[0]).isEqualTo("photos/abc def.jpg");
        long exp = Long.parseLong(p[1]), now = System.currentTimeMillis() / 1000;
        assertThat(exp - now).isBetween(MediaUrls.MIN_LIFETIME, MediaUrls.MIN_LIFETIME + 2 * MediaUrls.WINDOW);
        assertThat(media.valid(p[0], exp, p[2])).isTrue();
    }

    @Test
    void lienModifieOuExpireRefuse() {
        String[] p = parts(media.sign("/casting-media/casting-media/photos/a.jpg"));
        long exp = Long.parseLong(p[1]);
        assertThat(media.valid("photos/autre.jpg", exp, p[2])).isFalse();      // autre fichier
        assertThat(media.valid(p[0], exp + 1800, p[2])).isFalse();             // durée allongée à la main
        assertThat(media.valid(p[0], exp, p[2].substring(1) + "A")).isFalse(); // signature modifiée
        assertThat(media.valid(p[0], 1000, p[2])).isFalse();                   // expiré
        assertThat(media.valid(p[0], exp, null)).isFalse();
    }

    @Test
    void adresseExterieureInchangee() {
        assertThat(media.sign("/api/portraits/12")).isEqualTo("/api/portraits/12");
        assertThat(media.sign(null)).isNull();
    }
}
