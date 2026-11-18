package com.castingai.dto.actor;

import lombok.Builder;
import lombok.Data;
import java.util.UUID;

@Data
@Builder
public class ActorSummaryResponse {
    private UUID id;
    private String firstName;
    private String lastName;
    private String city;
    private String country;
    private String gender;
    private Integer height;
    private String eyeColor;
    private String hairColor;
    private Integer age;           // ← nouveau
    @tools.jackson.databind.annotation.JsonSerialize(using = com.castingai.storage.MediaUrls.Signed.class) private String mainPhotoUrl;   // ← nouveau
}