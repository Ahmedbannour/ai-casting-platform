package com.castingai.exception;

/** La demande entre en conflit avec l'état actuel (doublon, second « choisi ») : réponse 409. */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) { super(message); }
}
