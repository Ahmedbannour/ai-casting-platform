package com.castingai.exception;

/** Action non autorisée pour le rôle de l'utilisateur : réponse 403. */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) { super(message); }
}
