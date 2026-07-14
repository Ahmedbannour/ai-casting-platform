package com.castingai.dto.photo;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class PhotoUploadResponse {
    private int uploaded;
    private List<PhotoResponse> photos;
}