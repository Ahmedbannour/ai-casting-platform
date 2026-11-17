package com.castingai.config;

import com.castingai.entity.*;
import com.castingai.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Random;

/**
 * Seeds the database with 100 realistic actors for testing.
 * Runs once at startup if no actors exist. Jamais en production (profil « prod »).
 */
@Slf4j
@Component
@org.springframework.context.annotation.Profile("!prod")   // T-106 : données et compte de démonstration hors production seulement
@RequiredArgsConstructor
public class DataSeederService implements ApplicationRunner {

    private final ActorRepository actorRepository;
    private final ActorPhotoRepository photoRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    private final Random random = new Random(42);

    // ── Data pools ────────────────────────────────────

    private static final String[] FIRST_NAMES_F = {
            "Sophie", "Marie", "Camille", "Julie", "Laura",
            "Emma", "Alice", "Léa", "Chloé", "Sarah",
            "Inès", "Manon", "Jade", "Lucie", "Charlotte",
            "Anaïs", "Mathilde", "Pauline", "Clara", "Margot",
            "Yasmine", "Fatima", "Amira", "Leila", "Nadia",
            "Isabella", "Elena", "Sofia", "Victoria", "Valentina",
            "Océane", "Roxane", "Céline", "Audrey", "Mélanie",
            "Justine", "Élise", "Adèle", "Noémie", "Clémence",
            "Hafsa", "Samira", "Rania", "Sara", "Lina",
            "Zoé", "Maëlle", "Lola", "Nina", "Nora"
    };

    private static final String[] FIRST_NAMES_M = {
            "Thomas", "Nicolas", "Julien", "Alexandre", "Pierre",
            "Antoine", "François", "Maxime", "Lucas", "Romain",
            "Hugo", "Théo", "Arthur", "Baptiste", "Clément",
            "Raphaël", "Louis", "Mathieu", "Valentin", "Axel",
            "Karim", "Mohamed", "Youssef", "Adam", "Amine",
            "Gabriel", "Nathan", "Ethan", "Paul", "Florian",
            "Mehdi", "Rachid", "Omar", "Samir", "Tarek",
            "Léo", "Victor", "Simon", "Robin", "Quentin",
            "Damien", "Sébastien", "Grégoire", "Tristan", "Edouard",
            "Matteo", "Lorenzo", "Marco", "Diego", "Carlos"
    };

    private static final String[] LAST_NAMES = {
            "Martin", "Bernard", "Thomas", "Petit", "Robert",
            "Richard", "Durand", "Dubois", "Moreau", "Laurent",
            "Simon", "Michel", "Lefebvre", "Leroy", "Roux",
            "David", "Bertrand", "Morel", "Fournier", "Girard",
            "Bonnet", "Dupont", "Lambert", "Fontaine", "Rousseau",
            "Vincent", "Muller", "Lefevre", "Faure", "Andre",
            "Mercier", "Blanc", "Guerin", "Boyer", "Garnier",
            "Chevalier", "Francois", "Legrand", "Gauthier", "Garcia",
            "Perrin", "Robin", "Clement", "Morin", "Nicolas",
            "Henry", "Roussel", "Mathieu", "Gautier", "Masson",
            "Benali", "Hadj", "Khalil", "Mansouri", "Bouali",
            "Ferrari", "Rossi", "Romano", "Conti", "Esposito"
    };

    private static final String[] CITIES = {
            "Paris", "Lyon", "Marseille", "Bordeaux", "Toulouse",
            "Nice", "Nantes", "Strasbourg", "Montpellier", "Lille",
            "Rennes", "Reims", "Saint-Étienne", "Toulon", "Grenoble",
            "Dijon", "Angers", "Nîmes", "Villeurbanne", "Le Havre"
    };

    private static final String[][] SKILLS = {
            {"Danse", "Avancé"}, {"Chant", "Expert"},
            {"Danse", "Intermédiaire"}, {"Comédie", "Expert"},
            {"Sport", "Avancé"}, {"Piano", "Intermédiaire"},
            {"Guitare", "Avancé"}, {"Équitation", "Débutant"},
            {"Arts martiaux", "Avancé"}, {"Natation", "Expert"},
            {"Acrobatie", "Intermédiaire"}, {"Mime", "Avancé"},
            {"Improvisation", "Expert"}, {"Escrime", "Intermédiaire"},
            {"Danse contemporaine", "Expert"}, {"Hip-hop", "Avancé"},
            {"Comédie musicale", "Expert"}, {"Doublage", "Avancé"},
            {"Cascades", "Intermédiaire"}, {"Yoga", "Avancé"}
    };

    private static final String[][] LANGUAGES = {
            {"Français", "Natif"}, {"Anglais", "Courant"},
            {"Espagnol", "Intermédiaire"}, {"Arabe", "Natif"},
            {"Italien", "Courant"}, {"Allemand", "Intermédiaire"},
            {"Portugais", "Courant"}, {"Russe", "Débutant"},
            {"Mandarin", "Notions"}, {"Japonais", "Notions"}
    };

    private static final String[] PRODUCTIONS = {
            "Le Dernier Train", "Paris by Night", "Lumière d'été",
            "Les Fantômes", "Demain nous appartient", "Plus belle la vie",
            "Engrenages", "Baron noir", "Marseille", "Call my agent",
            "Dix pour cent", "L'Emprise", "Le Bureau des légendes",
            "Spiral", "Braquo", "Platane", "Caméra café", "Kaamelott",
            "La Flamme", "Validé", "Lupin", "Arsène", "HPI",
            "Crime parfait", "Section de recherches", "Meurtres à",
            "Une famille formidable", "Profilage", "Nina", "Candice Renoir"
    };

    private static final String[] ROLES = {
            "Rôle principal", "Seconds rôle", "Guest star",
            "Personnage récurrent", "Antagoniste", "Héros",
            "Détective", "Médecin", "Avocat", "Professeur",
            "Journaliste", "Policier", "Criminel", "Amant",
            "Père / Mère", "Enfant prodige", "Mentor", "Comique"
    };

    private static final String[] EYE_COLORS = {
            "Bleu", "Vert", "Marron", "Noisette", "Gris", "Noir"
    };

    private static final String[] HAIR_COLORS = {
            "Brun", "Blond", "Noir", "Roux", "Châtain", "Gris"
    };

    // ─────────────────────────────────────────────────────────
    //  MAIN RUNNER
    // ─────────────────────────────────────────────────────────

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws Exception {
        if (actorRepository.count() >= 10) {
            log.info("Database already seeded ({} actors) — skipping", actorRepository.count());
            return;
        }

        log.info("Starting database seeding with 100 actors...");
        ensureAdminUser();
        seedActors(100);
        log.info("✅ Seeding complete — {} actors created", actorRepository.count());
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN USER
    // ─────────────────────────────────────────────────────────

    private void ensureAdminUser() {
        if (!userRepository.existsByEmail("ahmed@casting.com")) {
            userRepository.save(User.builder()
                    .email("ahmed@casting.com")
                    .password(passwordEncoder.encode("password123"))
                    .firstName("Ahmed")
                    .lastName("Bannour")
                    .role(Role.ADMIN)
                    .enabled(true).emailVerifiedAt(java.time.LocalDateTime.now())
                    .build());
            log.info("Admin user created: ahmed@casting.com / password123");
        }
    }

    // ─────────────────────────────────────────────────────────
    //  ACTORS
    // ─────────────────────────────────────────────────────────

    private void seedActors(int count) {
        for (int i = 0; i < count; i++) {
            boolean isFemale = i % 2 == 0;
            Actor actor = buildActor(i, isFemale);
            actor = actorRepository.save(actor);
            addPhotos(actor, isFemale, i);
            log.debug("Created actor {}/{}: {} {}",
                    i + 1, count, actor.getFirstName(), actor.getLastName());
        }
    }

    private Actor buildActor(int index, boolean isFemale) {
        String firstName = isFemale
                ? FIRST_NAMES_F[index % FIRST_NAMES_F.length]
                : FIRST_NAMES_M[index % FIRST_NAMES_M.length];
        String lastName = LAST_NAMES[index % LAST_NAMES.length];
        String city = CITIES[random.nextInt(CITIES.length)];

        // Age between 18 and 55
        int age = 18 + random.nextInt(38);
        LocalDate birthDate = LocalDate.now().minusYears(age).minusDays(random.nextInt(365));

        Actor actor = Actor.builder()
                .firstName(firstName)
                .lastName(lastName)
                .birthDate(birthDate)
                .gender(isFemale ? "Femme" : "Homme")
                .city(city)
                .country("France")
                .phone("+336" + String.format("%08d", random.nextInt(100000000)))
                .email(firstName.toLowerCase() + "." + lastName.toLowerCase()
                        + (index > 0 ? index : "") + "@actor.fr")
                .bio(buildBio(firstName, lastName, city, age, isFemale))
                .height(isFemale ? 160 + random.nextInt(20) : 170 + random.nextInt(20))
                .weight(isFemale ? 50 + random.nextInt(25) : 65 + random.nextInt(30))
                .eyeColor(EYE_COLORS[random.nextInt(EYE_COLORS.length)])
                .hairColor(HAIR_COLORS[random.nextInt(HAIR_COLORS.length)])
                .build();

        // Skills — 1 to 4
        int skillCount = 1 + random.nextInt(4);
        for (int i = 0; i < skillCount; i++) {
            String[] skill = SKILLS[(index + i) % SKILLS.length];
            ActorSkill s = ActorSkill.builder()
                    .actor(actor)
                    .name(skill[0])
                    .level(skill[1])
                    .build();
            actor.getSkills().add(s);
        }

        // Languages — always French + 1 or 2 others
        ActorLanguage french = ActorLanguage.builder()
                .actor(actor).name("Français").level("Natif").build();
        actor.getLanguages().add(french);

        int extraLangs = random.nextInt(3);
        for (int i = 0; i < extraLangs; i++) {
            String[][] otherLangs = {
                    {"Anglais", "Courant"}, {"Espagnol", "Intermédiaire"},
                    {"Arabe", "Natif"}, {"Italien", "Courant"},
                    {"Allemand", "Débutant"}, {"Portugais", "Notions"}
            };
            String[] lang = otherLangs[(index + i) % otherLangs.length];
            if (!lang[0].equals("Français")) {
                ActorLanguage l = ActorLanguage.builder()
                        .actor(actor).name(lang[0]).level(lang[1]).build();
                actor.getLanguages().add(l);
            }
        }

        // Experiences — 1 to 5
        int expCount = 1 + random.nextInt(5);
        for (int i = 0; i < expCount; i++) {
            String production = PRODUCTIONS[(index + i) % PRODUCTIONS.length];
            String role = ROLES[(index + i * 3) % ROLES.length];
            int year = 2015 + random.nextInt(11);
            ActorExperience exp = ActorExperience.builder()
                    .actor(actor)
                    .title(role)
                    .production(production)
                    .role(role)
                    .year(year)
                    .description("Participation à " + production + " en " + year
                            + " — " + role + ".")
                    .build();
            actor.getExperiences().add(exp);
        }

        // Availability
        ActorAvailability avail = ActorAvailability.builder()
                .actor(actor)
                .fromDate(LocalDate.now().plusDays(random.nextInt(30)))
                .toDate(LocalDate.now().plusDays(30 + random.nextInt(180)))
                .note("Disponible pour tournage")
                .build();
        actor.getAvailabilities().add(avail);

        return actor;
    }

    private String buildBio(String firstName, String lastName,
                            String city, int age, boolean isFemale) {
        String pronoun = isFemale ? "Elle" : "Il";
        String[] formations = {
                "le Cours Florent", "l'ENSATT", "le Conservatoire National",
                "l'École du TNS", "Sciences Po Paris", "l'ESRA"
        };
        String formation = formations[random.nextInt(formations.length)];

        return firstName + " " + lastName + ", " + age + " ans, basé" +
                (isFemale ? "e" : "") + " à " + city + ". " +
                pronoun + " a été formé" + (isFemale ? "e" : "") + " à " + formation +
                ". " + pronoun + " cumule plusieurs années d'expérience " +
                "au cinéma et à la télévision. Profil polyvalent, " +
                (isFemale ? "disponible" : "disponible") + " pour longs et courts métrages.";
    }

    // ─────────────────────────────────────────────────────────
    //  PHOTOS — randomuser.me (vraies photos)
    // ─────────────────────────────────────────────────────────

    private void addPhotos(Actor actor, boolean isFemale, int index) {
        // randomuser.me provides real human photos, free, no API key
        String gender = isFemale ? "women" : "men";
        int photoIndex = (index % 99) + 1; // 1 to 99

        String mainUrl = "https://randomuser.me/api/portraits/"
                + gender + "/" + photoIndex + ".jpg";
        String thumbUrl = "https://randomuser.me/api/portraits/thumb/"
                + gender + "/" + photoIndex + ".jpg";

        ActorPhoto mainPhoto = ActorPhoto.builder()
                .actor(actor)
                .filename(gender + "_" + photoIndex + "_main.jpg")
                .originalName("photo_principale.jpg")
                .url(mainUrl)
                .thumbnailUrl(thumbUrl)
                .size(45000L)
                .isMain(true)
                .createdAt(LocalDateTime.now())
                .build();
        photoRepository.save(mainPhoto);

        // Add 1-2 additional photos
        int extraPhotos = random.nextInt(2);
        for (int i = 1; i <= extraPhotos; i++) {
            int altIndex = ((index + i * 7) % 99) + 1;
            String altUrl = "https://randomuser.me/api/portraits/"
                    + gender + "/" + altIndex + ".jpg";
            String altThumb = "https://randomuser.me/api/portraits/thumb/"
                    + gender + "/" + altIndex + ".jpg";

            ActorPhoto extra = ActorPhoto.builder()
                    .actor(actor)
                    .filename(gender + "_" + altIndex + "_extra" + i + ".jpg")
                    .originalName("photo_" + i + ".jpg")
                    .url(altUrl)
                    .thumbnailUrl(altThumb)
                    .size(38000L)
                    .isMain(false)
                    .createdAt(LocalDateTime.now())
                    .build();
            photoRepository.save(extra);
        }
    }
}