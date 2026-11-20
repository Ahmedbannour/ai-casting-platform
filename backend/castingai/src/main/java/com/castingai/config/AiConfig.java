package com.castingai.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
public class AiConfig {

    /**
     * Client de l'IA locale (Ollama). Le modèle met souvent 10 à 60 s à répondre : sans délai explicite,
     * l'appel était coupé vers 10 s et les explications revenaient vides (T-164).
     */
    @Bean
    public RestClient ollamaRestClient(@Value("${spring.ai.ollama.base-url:http://localhost:11434}") String baseUrl,
                                       @Value("${casting.ai.timeout-seconds:120}") int timeoutSeconds) {
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(timeoutSeconds));
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }
}
