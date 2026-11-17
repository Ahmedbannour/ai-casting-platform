package com.castingai.storage;

import org.springframework.web.multipart.MultipartFile;

/**
 * Abstraction for file storage operations.
 */
public interface StorageService {

    /**
     * Uploads a file and returns its public URL.
     */
    String upload(MultipartFile file, String filename) throws Exception;

    /**
     * Uploads a byte array (thumbnail) and returns its public URL.
     */
    String uploadBytes(byte[] data, String filename, String contentType) throws Exception;

    /**
     * Deletes a file by its filename.
     */
    void delete(String filename) throws Exception;

    /** T-110 · Lit un fichier stocké (export des données personnelles). */
    byte[] download(String key) throws Exception;

    /**
     * Retrouve la clé de l'objet à partir de son URL publique ; null si l'URL n'est pas de ce stockage.
     */
    String keyFromUrl(String url);
}
