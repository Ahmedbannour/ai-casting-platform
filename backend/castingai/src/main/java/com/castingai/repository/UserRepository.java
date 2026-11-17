package com.castingai.repository;

import com.castingai.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository for User entity.
 */
@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    java.util.Optional<User> findByAuthProviderAndProviderId(String authProvider, String providerId);


    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);
}