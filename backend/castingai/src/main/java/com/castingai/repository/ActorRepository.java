package com.castingai.repository;

import com.castingai.entity.Actor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.NativeQuery;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ActorRepository extends JpaRepository<Actor, UUID> {

    /** Fiche tenue par un compte freelance. */
    Optional<Actor> findByAccount_Id(UUID userId);

    /** Nombre de fiches par origine (AGENCE, INSCRIPTION, IMPORT). */
    @Query("select a.source, count(a) from Actor a group by a.source")
    List<Object[]> countBySource();

    /** Fiche saisie par l'agence, sans compte, avec cette adresse e-mail. */
    Optional<Actor> findFirstByAccountIsNullAndEmailIgnoreCase(String email);

    /** Doublons à l'import : même e-mail. */
    @Query("select lower(a.email) from Actor a where a.email is not null and lower(a.email) in :emails")
    List<String> findExistingEmails(@Param("emails") java.util.Collection<String> emails);

    /** Doublons à l'import : même prénom, nom et date de naissance. */
    @Query("select count(a) > 0 from Actor a where lower(a.firstName) = lower(:first) and lower(a.lastName) = lower(:last) and a.birthDate = :birth")
    boolean existsSamePerson(@Param("first") String first, @Param("last") String last, @Param("birth") java.time.LocalDate birth);

    @Query("SELECT a FROM Actor a WHERE a.visibility = 'VISIBLE' AND (:all = true OR a.agencyId IS NULL OR a.agencyId = :agency) AND " +
            "(:search IS NULL OR " +
            "LOWER(CAST(a.firstName AS string)) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')) OR " +
            "LOWER(CAST(a.lastName AS string)) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')) OR " +
            "LOWER(CAST(a.city AS string)) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')))")
    Page<Actor> findBySearchTerm(@Param("search") String search, @Param("all") boolean all,
                                 @Param("agency") UUID agency, Pageable pageable);

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
    WHERE a.visibility = 'VISIBLE'
    AND (:all = true OR a.agencyId IS NULL OR a.agencyId = :agency)
    AND (:search = '' OR
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
            @Param("all") boolean all,
            @Param("agency") UUID agency,
            Pageable pageable);



    @Query("SELECT DISTINCT a FROM Actor a LEFT JOIN FETCH a.skills LEFT JOIN FETCH a.languages")
    List<Actor> findAllWithSkillsAndLanguages();

    /**
     * Recherche IA côté base : filtres stricts (genre, âge), puis classement par pertinence
     * (langue, compétence, ville, cheveux) et pagination. Ne charge que les identifiants d'une page.
     */
    @NativeQuery(value = """
        SELECT a.id FROM actors a
        WHERE a.visibility = 'VISIBLE'
          AND (:all OR a.agency_id IS NULL OR a.agency_id = :agency)
          AND (:gender = '' OR a.gender = :gender)
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
        WHERE a.visibility = 'VISIBLE'
          AND (:all OR a.agency_id IS NULL OR a.agency_id = :agency)
          AND (:gender = '' OR a.gender = :gender)
          AND (:minAge = 0 OR a.birth_date <= CURRENT_DATE - make_interval(years => CAST(:minAge AS int)))
          AND (:maxAge = 150 OR a.birth_date > CURRENT_DATE - make_interval(years => CAST(:maxAge AS int) + 1))
        """)
    Page<UUID> rankedSearch(@Param("gender") String gender,
                            @Param("minAge") int minAge,
                            @Param("maxAge") int maxAge,
                            @Param("language") String language,
                            @Param("skill") String skill,
                            @Param("city") String city,
                            @Param("hair") String hair,
                            @Param("all") boolean all,
                            @Param("agency") UUID agency,
                            Pageable pageable);
}