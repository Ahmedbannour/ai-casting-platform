package com.castingai.ai.dto;

import lombok.Data;

@Data
public class AiAnalysisResult {
    private String id;
    private int score;
    private String raison;
    private String points_forts;
    private String points_faibles;
    /** T-164 · Passage de l'intention du réalisateur que ce profil remplit. */
    private String passage;
}