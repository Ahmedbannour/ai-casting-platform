package com.castingai.service;

import com.castingai.entity.Actor;
import com.castingai.entity.User;
import com.castingai.repository.ActorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Lien entre un compte acteur (freelance) et sa fiche. */
@Service
@RequiredArgsConstructor
public class ActorAccountService {

    private final ActorRepository actorRepository;

    /**
     * Crée la fiche d'un nouveau compte acteur. Si l'agence avait déjà une fiche sans compte
     * avec la même adresse e-mail, le freelance la récupère au lieu d'en créer une seconde.
     */
    @Transactional
    public Actor createFicheFor(User user, String source) {
        return actorRepository.findByAccount_Id(user.getId()).orElseGet(() -> {
            Actor existing = actorRepository.findFirstByAccountIsNullAndEmailIgnoreCase(user.getEmail()).orElse(null);
            if (existing != null) {
                existing.setAccount(user);
                return actorRepository.save(existing);
            }
            Actor a = new Actor();
            a.setFirstName(user.getFirstName());
            a.setLastName(user.getLastName());
            a.setEmail(user.getEmail());
            a.setAccount(user);
            a.setCreatedBy(user);
            a.setSource(source);
            return actorRepository.save(a);
        });
    }
}
