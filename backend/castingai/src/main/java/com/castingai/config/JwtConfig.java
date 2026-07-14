package com.castingai.config;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * JWT configuration properties mapped from application.yml.
 */
@Getter
@Setter
@Configuration
@ConfigurationProperties(prefix = "jwt")
public class JwtConfig {

    private String secret;

    private long accessTokenExpiration;
    private long refreshTokenExpiration;

    @PostConstruct
    public void init() {
        System.out.println("SECRET = " + secret);
        System.out.println("ACCESS = " + accessTokenExpiration);
        System.out.println("REFRESH = " + refreshTokenExpiration);

    }

}

