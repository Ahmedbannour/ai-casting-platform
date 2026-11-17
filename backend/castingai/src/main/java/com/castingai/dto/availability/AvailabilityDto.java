package com.castingai.dto.availability;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

@Data
public class AvailabilityDto {
    @NotNull(message = "Début de période obligatoire")
    private LocalDate fromDate;
    @NotNull(message = "Fin de période obligatoire")
    private LocalDate toDate;
    @Size(max = 160, message = "Note : 160 caractères au plus")
    private String note;

    /** La fin d'une période ne précède pas son début. */
    @JsonIgnore
    @AssertTrue(message = "La fin d'une disponibilité ne peut pas précéder son début")
    public boolean isPeriodOrdered() {
        return fromDate == null || toDate == null || !toDate.isBefore(fromDate);
    }

    /** Vrai si aucune période n'en chevauche une autre (bornes incluses). */
    public static boolean disjoint(List<AvailabilityDto> periods) {
        if (periods == null) return true;
        List<AvailabilityDto> sorted = periods.stream()
                .filter(Objects::nonNull)
                .filter(p -> p.fromDate != null && p.toDate != null && !p.toDate.isBefore(p.fromDate))
                .sorted(Comparator.comparing(AvailabilityDto::getFromDate))
                .toList();
        for (int i = 1; i < sorted.size(); i++) {
            if (!sorted.get(i).fromDate.isAfter(sorted.get(i - 1).toDate)) return false;
        }
        return true;
    }
}
