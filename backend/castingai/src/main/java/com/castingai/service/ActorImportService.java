package com.castingai.service;

import com.castingai.dto.actor.ActorCreateRequest;
import com.castingai.dto.language.LanguageDto;
import com.castingai.dto.skill.SkillDto;
import com.castingai.repository.ActorRepository;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Import d'acteurs depuis un fichier Excel (.xlsx) ou CSV.
 * 1. Aperçu : lecture, reconnaissance des colonnes, nettoyage des valeurs, contrôle par les mêmes règles
 *    que la saisie, détection des doublons (en base et dans le fichier). Rien n'est enregistré.
 * 2. Enregistrement des lignes retenues par l'administrateur, avec un dernier contrôle des doublons.
 */
@Service
@RequiredArgsConstructor
public class ActorImportService {

    public static final int MAX_ROWS = 5000;

    private final ActorRepository actorRepository;
    private final ActorService actorService;
    private final Validator validator;

    // ── Résultats ──

    public record Column(String header, String field, String label) {}
    public record Row(int line, String status, List<String> errors, List<String> warnings, ActorCreateRequest data) {}
    public record Preview(String fileName, int totalRows, List<Column> columns, List<Row> rows,
                          int ok, int errors, int duplicates, int warnings) {}
    public record Skipped(int index, String reason) {}
    public record CommitResult(int created, List<Skipped> skipped) {}

    // ── Colonnes reconnues (en-têtes français et anglais, sans accents ni espaces) ──

    private static final Map<String, String> FIELD_LABELS = new LinkedHashMap<>();
    private static final Map<String, String> SYNONYMS = new HashMap<>();
    static {
        String[][] defs = {
            {"firstName", "Prénom", "prenom,prenoms,firstname,first,givenname,prénom"},
            {"lastName", "Nom", "nom,nomdefamille,lastname,last,surname,familyname"},
            {"fullName", "Nom complet", "nomcomplet,nometprenom,prenometnom,nomprenom,fullname,name,acteur,actrice,comedien"},
            {"birthDate", "Date de naissance", "datedenaissance,datenaissance,naissance,nele,nee,dob,birthdate,dateofbirth,birthday"},
            {"age", "Âge", "age,ages"},
            {"gender", "Genre", "genre,sexe,gender,sex"},
            {"city", "Ville", "ville,city,localite,commune"},
            {"country", "Pays", "pays,country,nationalite"},
            {"phone", "Téléphone", "telephone,tel,phone,mobile,portable,gsm,numero,numerodetelephone"},
            {"email", "E-mail", "email,mail,courriel,adressemail,adresseemail,emailaddress"},
            {"height", "Taille", "taille,height,taillecm,hauteur"},
            {"weight", "Poids", "poids,weight,poidskg"},
            {"eyeColor", "Yeux", "yeux,couleurdesyeux,couleuryeux,eyes,eyecolor,eyecolour"},
            {"hairColor", "Cheveux", "cheveux,couleurdescheveux,couleurcheveux,hair,haircolor,haircolour"},
            {"languages", "Langues", "langues,langue,languages,language,languesparlees"},
            {"skills", "Compétences", "competences,competence,skills,skill,talents,talent,specialites"},
            {"bio", "Biographie", "bio,biographie,description,presentation,profil,commentaire,notes"}
        };
        for (String[] d : defs) {
            FIELD_LABELS.put(d[0], d[1]);
            for (String syn : d[2].split(",")) SYNONYMS.put(key(syn), d[0]);
        }
    }

    // ── 1. Aperçu ──

    @Transactional(readOnly = true)
    public Preview preview(MultipartFile file) throws IOException {
        String name = Optional.ofNullable(file.getOriginalFilename()).orElse("fichier");
        String lower = name.toLowerCase(Locale.ROOT);
        List<List<String>> table;
        if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) table = readExcel(file.getBytes());
        else if (lower.endsWith(".csv") || lower.endsWith(".txt")) table = readCsv(file.getBytes());
        else throw new IllegalArgumentException("Format non pris en charge : fichier Excel (.xlsx) ou CSV attendu");

        // Première ligne non vide = en-têtes
        int headerIdx = 0;
        while (headerIdx < table.size() && table.get(headerIdx).stream().allMatch(String::isBlank)) headerIdx++;
        if (headerIdx >= table.size()) throw new IllegalArgumentException("Le fichier est vide");
        List<String> headers = table.get(headerIdx);

        List<Column> columns = new ArrayList<>();
        String[] fieldOf = new String[headers.size()];
        Set<String> used = new HashSet<>();
        for (int c = 0; c < headers.size(); c++) {
            String f = SYNONYMS.get(key(headers.get(c)));
            if (f != null && used.add(f)) fieldOf[c] = f; else f = null;
            columns.add(new Column(headers.get(c), f, f == null ? null : FIELD_LABELS.get(f)));
        }
        boolean hasName = used.contains("lastName") || used.contains("fullName");
        if (!hasName) {
            throw new IllegalArgumentException("Aucune colonne « Nom » reconnue. En-têtes trouvés : " + String.join(", ", headers));
        }

        List<Row> rows = new ArrayList<>();
        Map<String, Integer> seenEmail = new HashMap<>();
        Map<String, Integer> seenPerson = new HashMap<>();
        int dataRows = 0;
        for (int r = headerIdx + 1; r < table.size(); r++) {
            List<String> cells = table.get(r);
            if (cells.stream().allMatch(String::isBlank)) continue;
            if (++dataRows > MAX_ROWS) {
                throw new IllegalArgumentException("Le fichier dépasse " + MAX_ROWS + " lignes : découpez-le en plusieurs fichiers");
            }
            Map<String, String> v = new HashMap<>();
            for (int c = 0; c < fieldOf.length && c < cells.size(); c++) {
                if (fieldOf[c] != null && !cells.get(c).isBlank()) v.put(fieldOf[c], cells.get(c).trim());
            }
            rows.add(analyse(r + 1, v, seenEmail, seenPerson));
        }

        // Doublons avec la base : une seule requête pour tous les e-mails
        Set<String> emails = new HashSet<>();
        rows.forEach(x -> { if (x.data().getEmail() != null) emails.add(x.data().getEmail()); });
        Set<String> existing = emails.isEmpty() ? Set.of() : new HashSet<>(actorRepository.findExistingEmails(emails));
        List<Row> finalRows = new ArrayList<>();
        for (Row x : rows) {
            ActorCreateRequest d = x.data();
            String dup = null;
            if (d.getEmail() != null && existing.contains(d.getEmail())) dup = "Déjà en base : même adresse e-mail";
            else if (d.getBirthDate() != null && d.getFirstName() != null && d.getLastName() != null
                    && actorRepository.existsSamePerson(d.getFirstName(), d.getLastName(), d.getBirthDate())) {
                dup = "Déjà en base : même prénom, nom et date de naissance";
            }
            if (dup != null && x.status().equals("OK")) {
                List<String> errs = new ArrayList<>(x.errors()); errs.add(dup);
                x = new Row(x.line(), "DOUBLON", errs, x.warnings(), d);
            }
            finalRows.add(x);
        }

        int ok = 0, err = 0, dup = 0, warn = 0;
        for (Row x : finalRows) {
            switch (x.status()) { case "OK" -> ok++; case "ERREUR" -> err++; default -> dup++; }
            if (!x.warnings().isEmpty()) warn++;
        }
        return new Preview(name, finalRows.size(), columns, finalRows, ok, err, dup, warn);
    }

    private Row analyse(int line, Map<String, String> v, Map<String, Integer> seenEmail, Map<String, Integer> seenPerson) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        ActorCreateRequest a = new ActorCreateRequest();

        // Nom : colonnes séparées, ou un « nom complet » à découper (le dernier mot = nom de famille)
        String first = v.get("firstName"), last = v.get("lastName");
        if ((first == null || last == null) && v.get("fullName") != null) {
            String[] parts = v.get("fullName").trim().split("\\s+");
            if (parts.length >= 2) {
                if (first == null) first = String.join(" ", Arrays.copyOf(parts, parts.length - 1));
                if (last == null) last = parts[parts.length - 1];
                warnings.add("Nom complet découpé : prénom « " + properName(first) + " », nom « " + properName(last) + " »");
            } else if (last == null) last = parts[0];
        }
        a.setFirstName(properName(first));
        a.setLastName(properName(last));

        // Date de naissance
        if (v.get("birthDate") != null) {
            LocalDate d = parseDate(v.get("birthDate"));
            if (d == null) errors.add("Date de naissance illisible : « " + v.get("birthDate") + " » (attendu jj/mm/aaaa)");
            else a.setBirthDate(d);
        } else if (v.get("age") != null) {
            warnings.add("Âge « " + v.get("age") + " » ignoré : indiquez une date de naissance pour qu'il reste juste");
        }

        // Genre
        if (v.get("gender") != null) {
            String g = gender(v.get("gender"));
            if (g == null) warnings.add("Genre « " + v.get("gender") + " » non reconnu, laissé vide");
            a.setGender(g);
        }

        a.setCity(properName(v.get("city")));
        a.setCountry(properName(v.get("country")));

        // E-mail
        if (v.get("email") != null) a.setEmail(v.get("email").trim().toLowerCase(Locale.ROOT).replace(" ", ""));

        // Téléphone
        if (v.get("phone") != null) {
            String p = phone(v.get("phone"));
            if (!p.equals(v.get("phone").trim())) warnings.add("Téléphone remis en forme : « " + p + " »");
            a.setPhone(p);
        }

        // Taille et poids
        if (v.get("height") != null) {
            Integer h = height(v.get("height"));
            if (h == null) errors.add("Taille illisible : « " + v.get("height") + " »");
            else { a.setHeight(h); if (!v.get("height").trim().equals(String.valueOf(h))) warnings.add("Taille convertie : " + h + " cm"); }
        }
        if (v.get("weight") != null) {
            Integer w = number(v.get("weight"));
            if (w == null) errors.add("Poids illisible : « " + v.get("weight") + " »");
            else a.setWeight(w);
        }

        a.setEyeColor(capitalize(v.get("eyeColor")));
        a.setHairColor(capitalize(v.get("hairColor")));
        if (v.get("bio") != null) a.setBio(v.get("bio").trim());

        // Langues et compétences : listes séparées par , ; / | « et »
        Set<String> langNames = new LinkedHashSet<>();
        for (String[] item : splitList(v.get("languages"))) {
            String l = language(item[0]);
            if (l != null && langNames.add(l)) {
                LanguageDto dto = new LanguageDto(); dto.setName(l); dto.setLevel(capitalize(item[1])); a.getLanguages().add(dto);
            }
        }
        Set<String> skillNames = new LinkedHashSet<>();
        for (String[] item : splitList(v.get("skills"))) {
            String s = capitalize(item[0]);
            if (s != null && skillNames.add(s.toLowerCase(Locale.ROOT))) {
                SkillDto dto = new SkillDto(); dto.setName(s); dto.setLevel(capitalize(item[1])); a.getSkills().add(dto);
            }
        }

        // Mêmes règles que la saisie à la main
        for (ConstraintViolation<ActorCreateRequest> cv : validator.validate(a)) {
            String m = cv.getMessage();
            if (!errors.contains(m)) errors.add(m);
        }

        String status = errors.isEmpty() ? "OK" : "ERREUR";

        // Doublons dans le fichier
        if (status.equals("OK")) {
            String personKey = (a.getFirstName() + "|" + a.getLastName() + "|" + a.getBirthDate()).toLowerCase(Locale.ROOT);
            Integer prev = a.getEmail() != null ? seenEmail.get(a.getEmail()) : null;
            if (prev == null && a.getBirthDate() != null) prev = seenPerson.get(personKey);
            if (prev != null) {
                status = "DOUBLON";
                errors.add("Doublon de la ligne " + prev + " du fichier");
            } else {
                if (a.getEmail() != null) seenEmail.put(a.getEmail(), line);
                if (a.getBirthDate() != null) seenPerson.put(personKey, line);
            }
        }
        return new Row(line, status, errors, warnings, a);
    }

    // ── 2. Enregistrement ──

    @Transactional
    public CommitResult commit(List<ActorCreateRequest> rows, String adminEmail) {
        int created = 0;
        List<Skipped> skipped = new ArrayList<>();
        Set<String> inBatch = new HashSet<>();
        for (int i = 0; i < rows.size(); i++) {
            ActorCreateRequest r = rows.get(i);
            Set<ConstraintViolation<ActorCreateRequest>> v = validator.validate(r);
            if (!v.isEmpty()) { skipped.add(new Skipped(i, v.iterator().next().getMessage())); continue; }
            String email = r.getEmail() == null || r.getEmail().isBlank() ? null : r.getEmail().trim().toLowerCase(Locale.ROOT);
            r.setEmail(email);
            if (email != null && (!inBatch.add(email) || !actorRepository.findExistingEmails(List.of(email)).isEmpty())) {
                skipped.add(new Skipped(i, "Déjà en base : même adresse e-mail")); continue;
            }
            if (r.getBirthDate() != null && actorRepository.existsSamePerson(r.getFirstName(), r.getLastName(), r.getBirthDate())) {
                skipped.add(new Skipped(i, "Déjà en base : même prénom, nom et date de naissance")); continue;
            }
            actorService.create(r, adminEmail, "IMPORT");
            created++;
        }
        return new CommitResult(created, skipped);
    }

    // ── Lecture des fichiers ──

    private static List<List<String>> readExcel(byte[] bytes) throws IOException {
        List<List<String>> out = new ArrayList<>();
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);
            DataFormatter fmt = new DataFormatter(Locale.FRANCE);
            for (org.apache.poi.ss.usermodel.Row row : sheet) {
                if (out.size() > MAX_ROWS + 50) break;
                List<String> cells = new ArrayList<>();
                int last = Math.max(row.getLastCellNum(), 0);
                for (int c = 0; c < last; c++) {
                    Cell cell = row.getCell(c, org.apache.poi.ss.usermodel.Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                    cells.add(cellText(cell, fmt));
                }
                // Ligne absente dans le fichier : on garde la numérotation d'Excel
                while (out.size() < row.getRowNum()) out.add(List.of());
                out.add(cells);
            }
        } catch (org.apache.poi.EncryptedDocumentException e) {
            throw new IllegalArgumentException("Le fichier est protégé par un mot de passe");
        } catch (RuntimeException e) {
            if (e instanceof IllegalArgumentException) throw e;
            throw new IllegalArgumentException("Fichier Excel illisible ou endommagé");
        }
        return out;
    }

    private static String cellText(Cell cell, DataFormatter fmt) {
        if (cell == null) return "";
        CellType t = cell.getCellType() == CellType.FORMULA ? cell.getCachedFormulaResultType() : cell.getCellType();
        if (t == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
            return cell.getLocalDateTimeCellValue().toLocalDate().toString();   // AAAA-MM-JJ, sans ambiguïté
        }
        if (t == CellType.NUMERIC) {
            double d = cell.getNumericCellValue();
            return d == Math.rint(d) && Math.abs(d) < 1e15 ? String.valueOf((long) d) : String.valueOf(d);
        }
        return fmt.formatCellValue(cell).trim();
    }

    private static List<List<String>> readCsv(byte[] bytes) {
        String text = decode(bytes);
        if (text.startsWith("\uFEFF")) text = text.substring(1);
        String firstLine = text.lines().findFirst().orElse("");
        char sep = count(firstLine, ';') >= count(firstLine, ',') ? (count(firstLine, ';') > 0 ? ';' : ',') : ',';
        if (count(firstLine, '\t') > count(firstLine, sep)) sep = '\t';

        List<List<String>> out = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (quoted) {
                if (ch == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') { cur.append('"'); i++; } else quoted = false;
                } else cur.append(ch);
            } else if (ch == '"') quoted = true;
            else if (ch == sep) { row.add(cur.toString().trim()); cur.setLength(0); }
            else if (ch == '\n' || ch == '\r') {
                if (ch == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
                row.add(cur.toString().trim()); cur.setLength(0);
                out.add(row); row = new ArrayList<>();
                if (out.size() > MAX_ROWS + 50) break;
            } else cur.append(ch);
        }
        if (cur.length() > 0 || !row.isEmpty()) { row.add(cur.toString().trim()); out.add(row); }
        return out;
    }

    /** UTF-8 si le fichier est valide en UTF-8, sinon Windows-1252 (CSV enregistré par Excel). */
    private static String decode(byte[] bytes) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(java.nio.ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            return new String(bytes, Charset.forName("windows-1252"));
        }
    }

    private static int count(String s, char c) { int n = 0; for (char x : s.toCharArray()) if (x == c) n++; return n; }

    // ── Nettoyage des valeurs ──

    static String key(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    /** « jean-PIERRE d'arc » → « Jean-Pierre D'Arc ». */
    static String properName(String s) {
        if (s == null || s.isBlank()) return s == null ? null : null;
        String t = s.trim().replaceAll("\\s+", " ").toLowerCase(Locale.FRENCH);
        StringBuilder b = new StringBuilder();
        boolean up = true;
        for (char c : t.toCharArray()) {
            b.append(up ? Character.toUpperCase(c) : c);
            up = c == ' ' || c == '-' || c == '\'' || c == '’';
        }
        return b.toString();
    }

    static String capitalize(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim().replaceAll("\\s+", " ");
        return Character.toUpperCase(t.charAt(0)) + t.substring(1).toLowerCase(Locale.FRENCH);
    }

    private static final DateTimeFormatter[] DATE_FORMATS = {
        DateTimeFormatter.ofPattern("d/M/uuuu"), DateTimeFormatter.ofPattern("d-M-uuuu"), DateTimeFormatter.ofPattern("d.M.uuuu"),
        DateTimeFormatter.ofPattern("uuuu-M-d"), DateTimeFormatter.ofPattern("uuuu/M/d")
    };

    static LocalDate parseDate(String raw) {
        String s = raw.trim();
        if (s.matches("\\d{4}-\\d{2}-\\d{2}T.*")) s = s.substring(0, 10);
        // Numéro de série Excel (jours depuis le 30/12/1899)
        if (s.matches("\\d{4,5}")) {
            int n = Integer.parseInt(s);
            if (n > 1000 && n < 80000) return LocalDate.of(1899, 12, 30).plusDays(n);
        }
        for (DateTimeFormatter f : DATE_FORMATS) {
            try { return LocalDate.parse(s, f.withResolverStyle(java.time.format.ResolverStyle.STRICT)); } catch (DateTimeParseException ignored) {}
        }
        // Année sur deux chiffres : 12/03/95 → 1995, 12/03/08 → 2008
        Matcher m = Pattern.compile("^(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2})$").matcher(s);
        if (m.matches()) {
            int y = Integer.parseInt(m.group(3));
            int century = y > LocalDate.now().getYear() % 100 ? 1900 : 2000;
            try { return LocalDate.of(century + y, Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1))); } catch (Exception ignored) {}
        }
        return null;
    }

    static String gender(String raw) {
        String k = key(raw);
        if (List.of("h", "homme", "m", "male", "masculin", "man", "garcon", "monsieur", "mr").contains(k)) return "Homme";
        if (List.of("f", "femme", "female", "feminin", "woman", "fille", "madame", "mme", "mlle").contains(k)) return "Femme";
        if (List.of("nb", "nonbinaire", "nonbinary", "autre", "x").contains(k)) return "Non-binaire";
        return null;
    }

    /** Garde chiffres, espaces et « + » ; 0033 → +33 ; zéro initial perdu par Excel rétabli. */
    static String phone(String raw) {
        String s = raw.trim();
        if (s.matches("\\d+\\.0")) s = s.substring(0, s.length() - 2);
        s = s.replaceAll("[^\\d+ ]", " ").replaceAll("\\s+", " ").trim();
        if (s.startsWith("00")) s = "+" + s.substring(2);
        String digits = s.replace(" ", "");
        if (digits.matches("[1-9]\\d{8}")) s = "0" + digits;          // 612345678 → 0612345678
        return s;
    }

    /** « 1m75 », « 1,75 », « 175 cm », « 175 » → 175. */
    static Integer height(String raw) {
        String s = raw.toLowerCase(Locale.ROOT).replace(" ", "").replace("cm", "");
        Matcher m = Pattern.compile("^(\\d)m(\\d{0,2})$").matcher(s);
        if (m.matches()) return Integer.parseInt(m.group(1)) * 100 + (m.group(2).isEmpty() ? 0 : Integer.parseInt(String.format("%-2s", m.group(2)).replace(' ', '0')));
        s = s.replace("m", "").replace(',', '.');
        try {
            double d = Double.parseDouble(s);
            return (int) Math.round(d < 3 ? d * 100 : d);
        } catch (NumberFormatException e) { return null; }
    }

    static Integer number(String raw) {
        String s = raw.toLowerCase(Locale.ROOT).replaceAll("[a-z\\s]", "").replace(',', '.');
        try { return (int) Math.round(Double.parseDouble(s)); } catch (NumberFormatException e) { return null; }
    }

    /** « Anglais (courant), espagnol / FR » → [[Anglais, courant], [espagnol, null], [FR, null]]. Le tiret reste dans le mot (« Hip-hop »). */
    static List<String[]> splitList(String raw) {
        List<String[]> out = new ArrayList<>();
        if (raw == null) return out;
        for (String part : raw.split("\\s*(?:[,;/|+\\n]|\\bet\\b|\\band\\b)\\s*")) {
            String p = part.trim();
            if (p.isEmpty()) continue;
            Matcher m = Pattern.compile("^(.*?)\\s*[(:]\\s*([^)]*)\\)?$").matcher(p);
            if (m.matches() && !m.group(1).isBlank() && !m.group(2).isBlank()) out.add(new String[]{m.group(1).trim(), m.group(2).trim()});
            else out.add(new String[]{p, null});
        }
        return out;
    }

    private static final Map<String, String> LANGS = Map.ofEntries(
        Map.entry("fr", "Français"), Map.entry("francais", "Français"), Map.entry("french", "Français"),
        Map.entry("en", "Anglais"), Map.entry("ang", "Anglais"), Map.entry("anglais", "Anglais"), Map.entry("english", "Anglais"),
        Map.entry("es", "Espagnol"), Map.entry("esp", "Espagnol"), Map.entry("espagnol", "Espagnol"), Map.entry("spanish", "Espagnol"),
        Map.entry("ar", "Arabe"), Map.entry("arabe", "Arabe"), Map.entry("arabic", "Arabe"),
        Map.entry("it", "Italien"), Map.entry("italien", "Italien"), Map.entry("italian", "Italien"),
        Map.entry("de", "Allemand"), Map.entry("all", "Allemand"), Map.entry("allemand", "Allemand"), Map.entry("german", "Allemand"),
        Map.entry("pt", "Portugais"), Map.entry("portugais", "Portugais"), Map.entry("portuguese", "Portugais")
    );

    static String language(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return LANGS.getOrDefault(key(raw), capitalize(raw));
    }
}
