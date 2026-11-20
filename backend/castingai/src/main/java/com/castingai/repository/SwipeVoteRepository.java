package com.castingai.repository;

import com.castingai.entity.SwipeVote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SwipeVoteRepository extends JpaRepository<SwipeVote, UUID> {
    @Query("select v from SwipeVote v join fetch v.user where v.entryId in :ids")
    List<SwipeVote> findForEntries(@Param("ids") Collection<UUID> ids);
    Optional<SwipeVote> findByEntryIdAndUserId(UUID entryId, UUID userId);
}
