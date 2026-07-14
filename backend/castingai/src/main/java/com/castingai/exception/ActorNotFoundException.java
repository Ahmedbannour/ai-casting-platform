package com.castingai.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.UUID;

/**
 * Thrown when an actor is not found by ID.
 */
@ResponseStatus(HttpStatus.NOT_FOUND)
public class ActorNotFoundException extends RuntimeException {

    public ActorNotFoundException(UUID id) {
        super("Actor not found with id: " + id);
    }
}