package com.castingai.dto.availability;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.LocalDate;

@Data
public class AvailabilityDto {
    @NotNull(message = "From date is required")
    private LocalDate fromDate;
    @NotNull(message = "To date is required")
    private LocalDate toDate;
    private String note;
}