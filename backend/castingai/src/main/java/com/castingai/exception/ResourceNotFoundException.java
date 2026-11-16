package com.castingai.exception;

/** Ressource introuvable ou invisible pour l'utilisateur : réponse 404. */
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) { super(message); }
}
