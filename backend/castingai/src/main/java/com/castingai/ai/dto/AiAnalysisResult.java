package com.castingai.ai.dto;

import lombok.Data;

@Data
public class AiAnalysisResult {
    private String id;
    private int score;
    private String raison;
    private String points_forts;
    private String points_faibles;
}