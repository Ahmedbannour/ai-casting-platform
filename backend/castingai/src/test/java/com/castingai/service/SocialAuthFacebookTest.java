package com.castingai.service;

import com.castingai.dto.auth.AuthResponse;
import com.castingai.exception.AuthException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.hamcrest.Matchers.startsWith;

/** Connexion Facebook : vérification du jeton, appsecret_proof et création du compte acteur (Facebook simulé). */
@SpringBootTest
@Testcontainers
class SocialAuthFacebookTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    private static final String APP = "1234567890";
    private static final String SECRET = "0123456789abcdef0123456789abcdef";   // valeur de test, pas une vraie clé

    @Autowired SocialAuthService social;
    MockRestServiceServer facebook;

    /** Le vrai Graph API répond en text/javascript, pas en application/json. */
    private static final MediaType FB_TYPE = MediaType.parseMediaType("text/javascript;charset=UTF-8");

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(social, "facebookAppId", APP);
        ReflectionTestUtils.setField(social, "facebookAppSecret", SECRET);
        RestClient.Builder b = RestClient.builder();
        facebook = MockRestServiceServer.bindTo(b).build();
        social.useHttp(b.build());
    }

    private static String proof(String token) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(token.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void jetonValideCreeUnCompteActeurAvecAppsecretProof() throws Exception {
        String token = "EAAtest123";
        facebook.expect(requestTo(startsWith("https://graph.facebook.com/v21.0/debug_token")))
                .andRespond(withSuccess("{\"data\":{\"is_valid\":true,\"app_id\":\"" + APP + "\"}}", FB_TYPE));
        facebook.expect(requestTo(startsWith("https://graph.facebook.com/v21.0/me")))
                .andExpect(queryParam("appsecret_proof", proof(token)))
                .andRespond(withSuccess("{\"id\":\"fb-42\",\"first_name\":\"Amine\",\"last_name\":\"Facebook\",\"email\":\"amine.fb@test.local\"}",
                        FB_TYPE));

        AuthResponse r = social.facebook(token);
        assertThat(r.getAccessToken()).isNotBlank();
        assertThat(r.getRole()).isEqualTo("ACTEUR");
        facebook.verify();
    }

    @Test
    void jetonDUneAutreApplicationRefuse() {
        facebook.expect(requestTo(startsWith("https://graph.facebook.com/v21.0/debug_token")))
                .andRespond(withSuccess("{\"data\":{\"is_valid\":true,\"app_id\":\"999\"}}", FB_TYPE));
        assertThatThrownBy(() -> social.facebook("EAAautre")).isInstanceOf(AuthException.class)
                .hasMessage("Jeton Facebook non destiné à cette application");
    }

    @Test
    void refusDeFacebookRestituéProprement() {
        facebook.expect(requestTo(startsWith("https://graph.facebook.com/v21.0/debug_token")))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(FB_TYPE)
                        .body("{\"error\":{\"message\":\"Error validating client secret.\",\"type\":\"OAuthException\",\"code\":1}}"));
        assertThatThrownBy(() -> social.facebook("EAAx")).isInstanceOf(AuthException.class).hasMessage("Jeton Facebook refusé");
    }
}
