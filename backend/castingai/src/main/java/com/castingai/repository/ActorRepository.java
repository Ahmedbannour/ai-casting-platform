package com.castingai.repository;

import com.castingai.entity.Actor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ActorRepository extends JpaRepository<Actor, UUID> {

    @Query("SELECT a FROM Actor a WHERE " +
            "(:search IS NULL OR " +
            "LOWER(CAST(a.firstName AS string)) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')) OR " +
            "LOWER(CAST(a.lastName AS string)) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')) OR " +
            "LOWER(CAST(a.city AS string)) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')))")
    Page<Actor> findBySearchTerm(@Param("search") String search, Pageable pageable);

    @Query("SELECT DISTINCT a FROM Actor a " +
            "LEFT JOIN FETCH a.skills " +
            "LEFT JOIN FETCH a.languages " +
            "LEFT JOIN FETCH a.experiences " +
            "LEFT JOIN FETCH a.availabilities")
    List<Actor> findAllWithDetails();

//    @Query("SELECT DISTINCT a FROM Actor a " +
//            "LEFT JOIN FETCH a.skills " +
//            "LEFT JOIN FETCH a.languages " +
//            "LEFT JOIN FETCH a.experiences " +
//            "LEFT JOIN FETCH a.availabilities " +
//            "WHERE a.id = :id")
//    Optional<Actor> findByIdWithDetails(@Param("id") UUID id);


    @Query("SELECT a FROM Actor a WHERE a.id = :id")
    Optional<Actor> findByIdSimple(@Param("id") UUID id);

    @Query("""
    SELECT a FROM Actor a
    WHERE (:search = '' OR
           LOWER(a.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
           LOWER(a.lastName) LIKE LOWER(CONCAT('%', :search, '%')))
    AND (:gender = '' OR a.gender = :gender)
    AND (:city = '' OR LOWER(a.city) LIKE LOWER(CONCAT('%', :city, '%')))
    AND ((:minAge = 0 AND :maxAge = 150) OR
         (FUNCTION('date_part', 'year', FUNCTION('age', a.birthDate)) >= :minAge AND
          FUNCTION('date_part', 'year', FUNCTION('age', a.birthDate)) <= :maxAge))
    """)
    // Jamais de paramètre null (PostgreSQL ne sait pas le typer) : valeurs neutres '' et 0..150
    Page<Actor> searchAdvanced(
            @Param("search") String search,
            @Param("gender") String gender,
            @Param("minAge") Integer minAge,
            @Param("maxAge") Integer maxAge,
            @Param("city") String city,
            Pageable pageable);



    @Query("SELECT DISTINCT a FROM Actor a LEFT JOIN FETCH a.skills LEFT JOIN FETCH a.languages")
    List<Actor> findAllWithSkillsAndLanguages();

    /**
     * Recherche IA côté base : filtres stricts (genre, âge), puis classement par pertinence
     * (langue, compétence, ville, cheveux) et pagination. Ne charge que les identifiants d'une page.
     */
    @Query(value = """
        SELECT a.id FROM actors a
        WHERE (:gender = '' OR a.gender = :gender)
          AND (:minAge = 0 OR a.birth_date <= CURRENT_DATE - make_interval(years => CAST(:minAge AS int)))
          AND (:maxAge = 150 OR a.birth_date > CURRENT_DATE - make_interval(years => CAST(:maxAge AS int) + 1))
        ORDER BY (
            (CASE WHEN :language <> '' AND EXISTS (SELECT 1 FROM actor_languages l WHERE l.actor_id = a.id
                  AND lower(l.name) LIKE '%' || lower(:language) || '%') THEN 30 ELSE 0 END)
          + (CASE WHEN :skill <> '' AND EXISTS (SELECT 1 FROM actor_skills s WHERE s.actor_id = a.id
                  AND lower(s.name) LIKE '%' || lower(:skill) || '%') THEN 15 ELSE 0 END)
          + (CASE WHEN :city <> '' AND lower(a.city) LIKE '%' || lower(:city) || '%' THEN 10 ELSE 0 END)
          + (CASE WHEN :hair <> '' AND lower(a.hair_color) LIKE '%' || lower(:hair) || '%' THEN 5 ELSE 0 END)
        ) DESC, a.last_name, a.id
        """,
        countQuery = """
        SELECT count(*) FROM actors a
        WHERE (:gender = '' OR a.gender = :gender)
          AND (:minAge = 0 OR a.birth_date <= CURRENT_DATE - make_interval(years => CAST(:minAge AS int)))
          AND (:maxAge = 150 OR a.birth_date > CURRENT_DATE - make_interval(years => CAST(:maxAge AS int) + 1))
        """,
        nativeQuery = true)
    Page<UUID> rankedSearch(@Param("gender") String gender,
                            @Param("minAge") int minAge,
                            @Param("maxAge") int maxAge,
                            @Param("language") String language,
                            @Param("skill") String skill,
                            @Param("city") String city,
                            @Param("hair") String hair,
                            Pageable pageable);
}