package com.castingai.service;

import com.castingai.dto.actor.ActorDetailResponse;
import com.castingai.dto.actor.CommentDto;
import com.castingai.dto.actor.CommentRequest;

import java.util.List;
import java.util.UUID;

public interface ActorDetailService {

    ActorDetailResponse getDetail(UUID actorId);

    List<CommentDto> getComments(UUID actorId);

    CommentDto addComment(UUID actorId, CommentRequest request, String userEmail);

    void deleteComment(UUID actorId, UUID commentId);
}