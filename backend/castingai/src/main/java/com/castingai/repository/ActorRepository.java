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



    @Query("SELECT DISTINCT a FROM Actor a LEFT JOIN FETCH a.skills LEFT JOIN FETCH a.languages")
    List<Actor> findAllWithSkillsAndLanguages();
}