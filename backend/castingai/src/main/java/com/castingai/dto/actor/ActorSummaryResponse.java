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
}