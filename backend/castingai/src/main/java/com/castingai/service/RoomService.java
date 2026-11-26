package com.castingai.service;

import com.castingai.entity.*;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.*;
import com.castingai.storage.MediaUrls;
import com.castingai.storage.StorageService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.annotation.JsonSerialize;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Room de casting d'un projet : la production la dirige (chef de room), règle les autorisations de chaque membre,
 * partage des documents par rôle, répartit les tâches ; le réalisateur, la marque et l'agence swipent la shortlist
 * de chaque rôle (Non / Oui / Coup de cœur) et le tableau de résultats classe les candidats.
 */
@Service
@RequiredArgsConstructor
public class RoomService {

    /** Côtés dont l'accord fait un « match » : chacun présent dans la room doit dire Oui (ou Coup de cœur). */
    static final List<Role> SIDES = List.of(Role.MARQUE, Role.AGENCE_MARKETING, Role.REALISATEUR);
    static final List<String> AUDIENCES = List.of("MARQUE", "AGENCE_MARKETING", "REALISATEUR", "BOITE_PROD");
    static final long MAX_FILE = 20L * 1024 * 1024;
    static final Set<String> EXT = Set.of("pdf", "doc", "docx", "ppt", "pptx", "odt", "odp", "key", "pages", "txt", "rtf",
            "jpg", "jpeg", "png", "webp", "xls", "xlsx", "csv", "mp4", "mov");

    // ── Vues et requêtes ──
    public record Perms(boolean lead, boolean swipe, boolean results, boolean docs, boolean tasks) {}
    public record MemberView(UUID userId, String name, String role, String organisation, boolean owner, Perms perms) {}
    public record RoleView(UUID id, String name, String importance, String intention, int candidates, int toSwipe, int matches) {}
    public record RoomSummary(UUID id, String title, String type, String status, String description, Perms me, UUID myId,
                              List<MemberView> members, List<RoleView> roles, long tasksOpen, long documents,
                              BrandService.Brand brand) {}
    public record RoomItem(UUID id, String title, String type, String status, int roles, int toSwipe, boolean lead) {}
    public record Card(UUID entryId, UUID actorId, String name, Integer age, String city, String gender, Integer height,
                       @JsonSerialize(using = MediaUrls.Signed.class) String photoUrl, String bio,
                       List<String> languages, List<String> skills, String note) {}
    public record VoteResult(String vote, boolean match, boolean newMatch, String actorName, int left) {}
    public record SideVote(String role, String name, String vote) {}
    public record ResultRow(UUID entryId, UUID actorId, String name, Integer age, String city,
                            @JsonSerialize(using = MediaUrls.Signed.class) String photoUrl,
                            int coeurs, int oui, int non, int voters, boolean match, Short rank, String myVote, List<SideVote> votes) {}
    public record DocView(UUID id, String name, String fileType, Long fileSize, List<String> audience, int version,
                          String uploadedBy, LocalDateTime updatedAt, boolean canEdit) {}
    public record TaskView(UUID id, String title, UUID assigneeId, String assigneeName, LocalDate dueDate, String status,
                           int position, boolean canEdit, boolean canMove) {}
    public record FileData(byte[] bytes, String name, String type) {}

    public record PermsRequest(Boolean swipe, Boolean results, Boolean docs, Boolean tasks, Boolean lead) {}
    public record InviteRequest(@NotBlank(message = "Indiquez l'e-mail du membre") String email) {}
    public record TaskRequest(@NotBlank(message = "Donnez un titre à la tâche") @Size(max = 200) String title, UUID assigneeId, LocalDate dueDate) {}
    public record TaskMove(String status, Integer position) {}
    public record VoteRequest(String vote) {}
    public record RankRequest(Short rank) {}
    public record AudienceRequest(List<String> audience) {}

    private final AccessService access;
    private final ProjectRepository projects;
    private final ProjectMemberRepository members;
    private final UserRepository users;
    private final CastingRoleRepository castingRoles;
    private final ShortlistEntryRepository entries;
    private final SwipeVoteRepository votes;
    private final RoomDocumentRepository docs;
    private final RoomTaskRepository tasks;
    private final ActorPhotoRepository photos;
    private final StorageService storage;
    private final NotificationService notifications;

    /** Autorisations par défaut d'un nouveau membre, selon son métier. */
    public static void defaults(ProjectMember m, User u) {
        defaults(m, u.getRole());
        if (u.getRole() == Role.ASSISTANT_PROD) {   // l'assistante : la room complète si le producer la lui a confiée
            boolean room = u.can("ROOM");
            m.setCanSwipe(false); m.setCanResults(true);
            m.setCanDocs(room); m.setCanTasks(room); m.setRoomLead(room);
        }
    }

    public static void defaults(ProjectMember m, Role role) {
        boolean prod = role == Role.BOITE_PROD || role == Role.ADMIN;
        m.setCanSwipe(prod || SIDES.contains(role));
        m.setCanResults(true);
        m.setCanDocs(prod);
        m.setCanTasks(prod);
        m.setRoomLead(prod);
        if (role == Role.TECHNICIEN) m.setCanResults(false);   // P-087 : l'équipe technique suit la room, sans les votes
    }

    // ── Room ──

    @Transactional(readOnly = true)
    public List<RoomItem> mine(String email) {
        User me = access.user(email);
        List<RoomItem> out = new ArrayList<>();
        for (Project p : projects.findVisible(me.getId(), access.isAdmin(me), AccessService.assistantOrg(me), null)) {
            Perms pr = perms(me, p);
            int toSwipe = 0;
            List<CastingRole> rs = castingRoles.findByProjectIdOrderByPositionAscCreatedAtAsc(p.getId());
            if (pr.swipe()) for (CastingRole r : rs) toSwipe += toSwipe(me, r);
            out.add(new RoomItem(p.getId(), p.getTitle(), p.getType().name(), p.getStatus().name(), rs.size(), toSwipe, pr.lead()));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public RoomSummary room(String email, UUID projectId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        Perms pr = perms(me, p);
        List<RoleView> rv = new ArrayList<>();
        Set<Role> sides = sides(p);
        for (CastingRole r : castingRoles.findByProjectIdOrderByPositionAscCreatedAtAsc(p.getId())) {
            List<ShortlistEntry> es = active(r);
            Map<UUID, List<SwipeVote>> byEntry = votesByEntry(es);
            int matches = (int) es.stream().filter(e -> isMatch(byEntry.getOrDefault(e.getId(), List.of()), sides)).count();
            rv.add(new RoleView(r.getId(), r.getName(), r.getImportance() == null ? null : r.getImportance().name(), r.getIntention(),
                    es.size(), pr.swipe() ? toSwipe(me, r) : 0, matches));
        }
        long open = tasks.findByProjectIdOrderByPositionAscCreatedAtAsc(p.getId()).stream().filter(t -> t.getStatus() != RoomTask.Status.FAIT).count();
        long docCount = docs.findByProjectIdOrderByUpdatedAtDesc(p.getId()).stream().filter(d -> seesDoc(me, p, d)).count();
        return new RoomSummary(p.getId(), p.getTitle(), p.getType().name(), p.getStatus().name(), p.getDescription(), pr, me.getId(),
                memberViews(p), rv, open, docCount, BrandService.of(p));
    }

    // ── Équipe et autorisations ──

    @Transactional
    public RoomSummary invite(String email, UUID projectId, InviteRequest req) {
        User me = access.user(email);
        Project p = leadProject(me, projectId);
        User u = users.findByEmail(req.email().trim().toLowerCase(Locale.ROOT)).filter(User::isEnabled)
                .orElseThrow(() -> new IllegalArgumentException("Aucun compte actif avec cette adresse"));
        if (u.getId().equals(p.getOwner().getId()) || projects.isMember(p.getId(), u.getId())) throw new IllegalArgumentException("Cette personne est déjà dans la room");
        ProjectMember m = new ProjectMember(p.getId(), u.getId(), LocalDateTime.now());
        defaults(m, u);
        members.save(m);
        notifications.push(u.getId(), "ROOM", "Vous rejoignez la room : " + p.getTitle(), name(me) + " vous invite dans la room de casting.", "/rooms/" + p.getId());
        return room(email, projectId);
    }

    @Transactional
    public RoomSummary setPerms(String email, UUID projectId, UUID userId, PermsRequest req) {
        User me = access.user(email);
        Project p = leadProject(me, projectId);
        ProjectMember m = members.findById(new ProjectMember.Key(p.getId(), userId))
                .orElseThrow(() -> new ResourceNotFoundException("Membre introuvable"));
        if (req.swipe() != null) m.setCanSwipe(req.swipe());
        if (req.results() != null) m.setCanResults(req.results());
        if (req.docs() != null) m.setCanDocs(req.docs());
        if (req.tasks() != null) m.setCanTasks(req.tasks());
        if (req.lead() != null) {
            if (userId.equals(me.getId()) && !req.lead()) throw new IllegalArgumentException("Passez d'abord la main à un autre membre");
            m.setRoomLead(req.lead());
        }
        members.save(m);
        return room(email, projectId);
    }

    @Transactional
    public RoomSummary removeMember(String email, UUID projectId, UUID userId) {
        User me = access.user(email);
        Project p = leadProject(me, projectId);
        if (userId.equals(me.getId())) throw new IllegalArgumentException("Vous ne pouvez pas vous retirer vous-même");
        members.deleteById(new ProjectMember.Key(p.getId(), userId));
        return room(email, projectId);
    }

    // ── Swipe ──

    @Transactional(readOnly = true)
    public List<Card> deck(String email, UUID projectId, UUID roleId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).swipe()) throw new ForbiddenException("Le swipe n'est pas ouvert pour vous dans cette room");
        CastingRole r = role(p, roleId);
        List<ShortlistEntry> es = active(r);
        Set<UUID> done = votes.findForEntries(ids(es)).stream().filter(v -> v.getUser().getId().equals(me.getId()))
                .map(SwipeVote::getEntryId).collect(Collectors.toSet());
        List<ShortlistEntry> todo = es.stream().filter(e -> !done.contains(e.getId())).toList();
        Map<UUID, String> ph = mainPhotos(todo.stream().map(e -> e.getActor().getId()).toList());
        return todo.stream().map(e -> {
            Actor a = e.getActor();
            return new Card(e.getId(), a.getId(), a.getFirstName() + " " + a.getLastName(), age(a.getBirthDate()), a.getCity(), a.getGender(),
                    a.getHeight(), ph.get(a.getId()), a.getBio(),
                    a.getLanguages().stream().map(ActorLanguage::getName).toList(), a.getSkills().stream().map(ActorSkill::getName).toList(), e.getNote());
        }).toList();
    }

    @Transactional
    public VoteResult vote(String email, UUID projectId, UUID entryId, VoteRequest req) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).swipe()) throw new ForbiddenException("Le swipe n'est pas ouvert pour vous dans cette room");
        ShortlistEntry e = entry(p, entryId);
        SwipeVote.Vote v;
        try { v = SwipeVote.Vote.valueOf(String.valueOf(req.vote()).toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException ex) { throw new IllegalArgumentException("Vote attendu : NON, OUI ou COEUR"); }
        Set<Role> sides = sides(p);
        boolean before = isMatch(votes.findForEntries(List.of(e.getId())), sides);
        SwipeVote sv = votes.findByEntryIdAndUserId(e.getId(), me.getId()).orElseGet(() -> { SwipeVote n = new SwipeVote(); n.setEntryId(e.getId()); n.setUser(me); return n; });
        sv.setVote(v); sv.setCreatedAt(LocalDateTime.now());
        votes.saveAndFlush(sv);
        boolean after = isMatch(votes.findForEntries(List.of(e.getId())), sides);
        String actor = e.getActor().getFirstName() + " " + e.getActor().getLastName();
        if (after && !before) {
            for (User lead : leads(p)) notifications.push(lead.getId(), "ROOM", "Match : " + actor,
                    "Toute l'équipe a dit oui pour le rôle « " + e.getRole().getName() + " ».", "/rooms/" + p.getId());
        }
        return new VoteResult(v.name(), after, after && !before, actor, toSwipe(me, e.getRole()));
    }

    @Transactional
    public void unvote(String email, UUID projectId, UUID entryId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        ShortlistEntry e = entry(p, entryId);
        votes.findByEntryIdAndUserId(e.getId(), me.getId()).ifPresent(votes::delete);
    }

    // ── Résultats ──

    @Transactional(readOnly = true)
    public List<ResultRow> results(String email, UUID projectId, UUID roleId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).results()) throw new ForbiddenException("Le tableau des résultats n'est pas ouvert pour vous");
        CastingRole r = role(p, roleId);
        List<ShortlistEntry> es = active(r);
        Map<UUID, List<SwipeVote>> byEntry = votesByEntry(es);
        Map<UUID, String> ph = mainPhotos(es.stream().map(e -> e.getActor().getId()).toList());
        Set<Role> sides = sides(p);
        List<ResultRow> rows = new ArrayList<>();
        for (ShortlistEntry e : es) {
            List<SwipeVote> vs = byEntry.getOrDefault(e.getId(), List.of());
            int coeur = (int) vs.stream().filter(v -> v.getVote() == SwipeVote.Vote.COEUR).count();
            int oui = (int) vs.stream().filter(v -> v.getVote() == SwipeVote.Vote.OUI).count();
            int non = (int) vs.stream().filter(v -> v.getVote() == SwipeVote.Vote.NON).count();
            String mine = vs.stream().filter(v -> v.getUser().getId().equals(me.getId())).map(v -> v.getVote().name()).findFirst().orElse(null);
            Actor a = e.getActor();
            rows.add(new ResultRow(e.getId(), a.getId(), a.getFirstName() + " " + a.getLastName(), age(a.getBirthDate()), a.getCity(), ph.get(a.getId()),
                    coeur, oui, non, vs.size(), isMatch(vs, sides), e.getPickRank(), mine,
                    vs.stream().map(v -> new SideVote(v.getUser().getRole().name(), name(v.getUser()), v.getVote().name())).toList()));
        }
        // 1er choix, remplaçant, suppléant d'abord ; puis coups de cœur, matchs, oui, et le moins de non.
        rows.sort(Comparator.comparing((ResultRow x) -> x.rank() == null ? 99 : x.rank())
                .thenComparing(ResultRow::coeurs, Comparator.reverseOrder())
                .thenComparing(ResultRow::match, Comparator.reverseOrder())
                .thenComparing(x -> x.oui() + x.coeurs(), Comparator.reverseOrder())
                .thenComparing(ResultRow::non));
        return rows;
    }

    @Transactional
    public List<ResultRow> rank(String email, UUID projectId, UUID entryId, RankRequest req) {
        User me = access.user(email);
        Project p = leadProject(me, projectId);
        ShortlistEntry e = entry(p, entryId);
        Short rank = req.rank();
        if (rank != null && (rank < 1 || rank > 3)) throw new IllegalArgumentException("Rang attendu : 1 (premier choix), 2 (remplaçant) ou 3 (suppléant)");
        if (rank != null) for (ShortlistEntry o : entries.findByRoleWithActor(e.getRole().getId()))
            if (!o.getId().equals(e.getId()) && rank.equals(o.getPickRank())) { o.setPickRank(null); entries.save(o); }
        e.setPickRank(rank);
        entries.save(e);
        return results(email, projectId, e.getRole().getId());
    }

    // ── Documents ──

    @Transactional(readOnly = true)
    public List<DocView> documents(String email, UUID projectId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        boolean edit = perms(me, p).docs();
        return docs.findByProjectIdOrderByUpdatedAtDesc(p.getId()).stream().filter(d -> seesDoc(me, p, d)).map(d -> docView(d, edit)).toList();
    }

    @Transactional
    public List<DocView> upload(String email, UUID projectId, MultipartFile file, List<String> audience) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).docs()) throw new ForbiddenException("Le partage de documents n'est pas ouvert pour vous");
        RoomDocument d = new RoomDocument();
        d.setProjectId(p.getId()); d.setUploadedBy(me);
        d.setAudience(audience(audience));
        store(p, d, file);
        docs.save(d);
        notifyAudience(p, d, me, "Nouveau document : " + d.getName());
        return documents(email, projectId);
    }

    @Transactional
    public List<DocView> replace(String email, UUID projectId, UUID docId, MultipartFile file) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).docs()) throw new ForbiddenException("Le partage de documents n'est pas ouvert pour vous");
        RoomDocument d = doc(p, docId);
        String old = d.getFileKey();
        store(p, d, file);
        d.setVersion(d.getVersion() + 1); d.setUpdatedAt(LocalDateTime.now()); d.setUploadedBy(me);
        docs.save(d);
        try { storage.delete(old); } catch (Exception ignored) { }
        notifyAudience(p, d, me, "Document mis à jour (v" + d.getVersion() + ") : " + d.getName());
        return documents(email, projectId);
    }

    @Transactional
    public List<DocView> setAudience(String email, UUID projectId, UUID docId, AudienceRequest req) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).docs()) throw new ForbiddenException("Le partage de documents n'est pas ouvert pour vous");
        RoomDocument d = doc(p, docId);
        d.setAudience(audience(req.audience()));
        docs.save(d);
        return documents(email, projectId);
    }

    @Transactional
    public List<DocView> deleteDoc(String email, UUID projectId, UUID docId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).docs()) throw new ForbiddenException("Le partage de documents n'est pas ouvert pour vous");
        RoomDocument d = doc(p, docId);
        docs.delete(d);
        try { storage.delete(d.getFileKey()); } catch (Exception ignored) { }
        return documents(email, projectId);
    }

    @Transactional(readOnly = true)
    public FileData file(String email, UUID projectId, UUID docId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        RoomDocument d = doc(p, docId);
        if (!seesDoc(me, p, d)) throw new ResourceNotFoundException("Document introuvable");
        try { return new FileData(storage.download(d.getFileKey()), d.getName(), d.getFileType()); }
        catch (Exception e) { throw new IllegalStateException("Document indisponible pour le moment", e); }
    }

    // ── Tâches ──

    @Transactional(readOnly = true)
    public List<TaskView> tasks(String email, UUID projectId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        boolean edit = perms(me, p).tasks();
        return tasks.findByProjectIdOrderByPositionAscCreatedAtAsc(p.getId()).stream().map(t -> taskView(t, me, edit)).toList();
    }

    @Transactional
    public List<TaskView> addTask(String email, UUID projectId, TaskRequest req) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).tasks()) throw new ForbiddenException("La gestion des tâches n'est pas ouverte pour vous");
        RoomTask t = new RoomTask();
        t.setProjectId(p.getId()); t.setCreatedBy(me);
        t.setPosition((int) tasks.findByProjectIdOrderByPositionAscCreatedAtAsc(p.getId()).stream().filter(x -> x.getStatus() == RoomTask.Status.A_FAIRE).count());
        fill(p, t, req, me);
        tasks.save(t);
        return tasks(email, projectId);
    }

    @Transactional
    public List<TaskView> updateTask(String email, UUID projectId, UUID taskId, TaskRequest req) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).tasks()) throw new ForbiddenException("La gestion des tâches n'est pas ouverte pour vous");
        RoomTask t = task(p, taskId);
        fill(p, t, req, me);
        tasks.save(t);
        return tasks(email, projectId);
    }

    /** Déplacer une tâche (colonne et place) : gestionnaires des tâches, ou la personne à qui elle est confiée. */
    @Transactional
    public List<TaskView> moveTask(String email, UUID projectId, UUID taskId, TaskMove req) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        RoomTask t = task(p, taskId);
        boolean mine = t.getAssignee() != null && t.getAssignee().getId().equals(me.getId());
        if (!perms(me, p).tasks() && !mine) throw new ForbiddenException("Seule la personne chargée de la tâche peut la déplacer");
        RoomTask.Status to;
        try { to = req.status() == null ? t.getStatus() : RoomTask.Status.valueOf(req.status()); }
        catch (IllegalArgumentException ex) { throw new IllegalArgumentException("État attendu : A_FAIRE, EN_COURS ou FAIT"); }
        List<RoomTask> all = tasks.findByProjectIdOrderByPositionAscCreatedAtAsc(p.getId());
        List<RoomTask> col = new ArrayList<>(all.stream().filter(x -> x.getStatus() == to && !x.getId().equals(t.getId())).toList());
        int pos = req.position() == null ? col.size() : Math.max(0, Math.min(col.size(), req.position()));
        col.add(pos, t);
        boolean done = to == RoomTask.Status.FAIT && t.getStatus() != RoomTask.Status.FAIT;
        t.setStatus(to); t.setUpdatedAt(LocalDateTime.now());
        for (int i = 0; i < col.size(); i++) { col.get(i).setPosition(i); tasks.save(col.get(i)); }
        if (done && t.getCreatedBy() != null && !t.getCreatedBy().getId().equals(me.getId()))
            notifications.push(t.getCreatedBy().getId(), "ROOM", "Tâche faite : " + t.getTitle(), name(me) + " a terminé cette tâche.", "/rooms/" + p.getId());
        return tasks(email, projectId);
    }

    @Transactional
    public List<TaskView> deleteTask(String email, UUID projectId, UUID taskId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).tasks()) throw new ForbiddenException("La gestion des tâches n'est pas ouverte pour vous");
        tasks.delete(task(p, taskId));
        return tasks(email, projectId);
    }

    // ── Règles ──

    Perms perms(User me, Project p) {
        if (access.isAdmin(me)) return new Perms(true, true, true, true, true);
        if (p.getOwner().getId().equals(me.getId())) {
            boolean lead = me.getRole() == Role.BOITE_PROD;
            return new Perms(lead, true, true, true, true);
        }
        ProjectMember m = members.findById(new ProjectMember.Key(p.getId(), me.getId())).orElse(null);
        if (m == null) return new Perms(false, false, false, false, false);
        if (m.isRoomLead()) return new Perms(true, true, true, true, true);
        return new Perms(false, m.isCanSwipe(), m.isCanResults(), m.isCanDocs(), m.isCanTasks());
    }

    private Project leadProject(User me, UUID projectId) {
        Project p = access.visibleProject(me, projectId);
        if (!perms(me, p).lead()) throw new ForbiddenException("Réservé au chef de room (la boîte de production)");
        return p;
    }

    private List<User> roomUsers(Project p) {
        List<User> out = new ArrayList<>();
        out.add(p.getOwner());
        for (ProjectMember m : members.findByProjectIdOrderByAddedAtAsc(p.getId())) users.findById(m.getUserId()).ifPresent(out::add);
        return out;
    }

    private List<User> leads(Project p) {
        return roomUsers(p).stream().filter(u -> perms(u, p).lead()).toList();
    }

    /** Côtés (marque, agence, réalisateur) qui votent dans cette room. */
    private Set<Role> sides(Project p) {
        Set<Role> s = new LinkedHashSet<>();
        for (User u : roomUsers(p)) if (SIDES.contains(u.getRole()) && perms(u, p).swipe()) s.add(u.getRole());
        return s;
    }

    /** Match : chaque côté présent a au moins un Oui ou Coup de cœur, et aucun Non. */
    static boolean isMatch(List<SwipeVote> vs, Set<Role> sides) {
        if (sides.isEmpty()) return false;
        for (Role side : sides) {
            List<SwipeVote> mine = vs.stream().filter(v -> v.getUser().getRole() == side).toList();
            if (mine.isEmpty() || mine.stream().anyMatch(v -> v.getVote() == SwipeVote.Vote.NON)) return false;
        }
        return true;
    }

    private int toSwipe(User me, CastingRole r) {
        List<ShortlistEntry> es = active(r);
        if (es.isEmpty()) return 0;
        long done = votes.findForEntries(ids(es)).stream().filter(v -> v.getUser().getId().equals(me.getId())).count();
        return (int) (es.size() - done);
    }

    private List<ShortlistEntry> active(CastingRole r) {
        return entries.findByRoleWithActor(r.getId()).stream().filter(e -> e.getStatus() != ShortlistEntry.Status.REFUSE).toList();
    }

    private Map<UUID, List<SwipeVote>> votesByEntry(List<ShortlistEntry> es) {
        if (es.isEmpty()) return Map.of();
        return votes.findForEntries(ids(es)).stream().collect(Collectors.groupingBy(SwipeVote::getEntryId));
    }

    private static List<UUID> ids(List<ShortlistEntry> es) { return es.stream().map(ShortlistEntry::getId).toList(); }

    private CastingRole role(Project p, UUID roleId) {
        return castingRoles.findById(roleId).filter(r -> r.getProject().getId().equals(p.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Rôle introuvable"));
    }

    private ShortlistEntry entry(Project p, UUID entryId) {
        return entries.findById(entryId).filter(e -> e.getRole().getProject().getId().equals(p.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Candidat introuvable"));
    }

    private RoomDocument doc(Project p, UUID id) {
        return docs.findById(id).filter(d -> d.getProjectId().equals(p.getId())).orElseThrow(() -> new ResourceNotFoundException("Document introuvable"));
    }

    private RoomTask task(Project p, UUID id) {
        return tasks.findById(id).filter(t -> t.getProjectId().equals(p.getId())).orElseThrow(() -> new ResourceNotFoundException("Tâche introuvable"));
    }

    private boolean seesDoc(User me, Project p, RoomDocument d) {
        if (perms(me, p).lead()) return true;
        if (d.getUploadedBy() != null && d.getUploadedBy().getId().equals(me.getId())) return true;
        String side = me.getRole() == Role.ASSISTANT_PROD ? "BOITE_PROD" : me.getRole().name();   // l'assistante voit ce que voit sa boîte
        return Arrays.asList(d.getAudience().split(",")).contains(side);
    }

    private static String audience(List<String> in) {
        List<String> a = in == null ? AUDIENCES : in.stream().filter(AUDIENCES::contains).distinct().toList();
        if (a.isEmpty()) throw new IllegalArgumentException("Choisissez au moins un rôle qui verra le document");
        return String.join(",", a);
    }

    private void store(Project p, RoomDocument d, MultipartFile file) {
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("Choisissez un fichier");
        if (file.getSize() > MAX_FILE) throw new IllegalArgumentException("Le fichier dépasse 20 Mo");
        String original = Optional.ofNullable(file.getOriginalFilename()).orElse("document");
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        if (!EXT.contains(ext)) throw new IllegalArgumentException("Format accepté : PDF, Office, Keynote, texte, image, tableur ou vidéo courte");
        String safe = original.replaceAll("[^A-Za-z0-9._-]", "_");
        if (safe.length() > 80) safe = safe.substring(safe.length() - 80);
        String key = "rooms/" + p.getId() + "/" + UUID.randomUUID() + "-" + safe;
        try { storage.upload(file, key); } catch (Exception e) { throw new IllegalStateException("Envoi du fichier impossible pour le moment", e); }
        d.setFileKey(key); d.setName(original.length() > 200 ? original.substring(0, 200) : original);
        d.setFileType(file.getContentType()); d.setFileSize(file.getSize());
    }

    private void notifyAudience(Project p, RoomDocument d, User me, String title) {
        for (User u : roomUsers(p)) if (!u.getId().equals(me.getId()) && seesDoc(u, p, d))
            notifications.push(u.getId(), "ROOM", title, "Dans la room « " + p.getTitle() + " ».", "/rooms/" + p.getId());
    }

    private void fill(Project p, RoomTask t, TaskRequest req, User me) {
        t.setTitle(req.title().trim());
        t.setDueDate(req.dueDate());
        User before = t.getAssignee();
        if (req.assigneeId() == null) t.setAssignee(null);
        else {
            User u = roomUsers(p).stream().filter(x -> x.getId().equals(req.assigneeId())).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Confiez la tâche à un membre de la room"));
            t.setAssignee(u);
            if ((before == null || !before.getId().equals(u.getId())) && !u.getId().equals(me.getId()))
                notifications.push(u.getId(), "ROOM", "Nouvelle tâche : " + t.getTitle(), name(me) + " vous confie cette tâche" +
                        (t.getDueDate() == null ? "." : " pour le " + t.getDueDate() + "."), "/rooms/" + p.getId());
        }
        t.setUpdatedAt(LocalDateTime.now());
    }

    private List<MemberView> memberViews(Project p) {
        List<MemberView> out = new ArrayList<>();
        User o = p.getOwner();
        out.add(new MemberView(o.getId(), name(o), o.getRole().name(), org(o), true, perms(o, p)));
        for (ProjectMember m : members.findByProjectIdOrderByAddedAtAsc(p.getId()))
            users.findById(m.getUserId()).ifPresent(u -> out.add(new MemberView(u.getId(), name(u), u.getRole().name(), org(u), false, perms(u, p))));
        return out;
    }

    private DocView docView(RoomDocument d, boolean edit) {
        return new DocView(d.getId(), d.getName(), d.getFileType(), d.getFileSize(), List.of(d.getAudience().split(",")), d.getVersion(),
                d.getUploadedBy() == null ? null : name(d.getUploadedBy()), d.getUpdatedAt(), edit);
    }

    private TaskView taskView(RoomTask t, User me, boolean edit) {
        boolean mine = t.getAssignee() != null && t.getAssignee().getId().equals(me.getId());
        return new TaskView(t.getId(), t.getTitle(), t.getAssignee() == null ? null : t.getAssignee().getId(),
                t.getAssignee() == null ? null : name(t.getAssignee()), t.getDueDate(), t.getStatus().name(), t.getPosition(), edit, edit || mine);
    }

    private Map<UUID, String> mainPhotos(List<UUID> actorIds) {
        Map<UUID, String> out = new HashMap<>();
        if (actorIds.isEmpty()) return out;
        for (ActorPhoto ph : photos.findByActorIdInOrderByIsMainDescCreatedAtAsc(actorIds)) out.putIfAbsent(ph.getActor().getId(), ph.getUrl());
        return out;
    }

    private static Integer age(LocalDate birth) { return birth == null ? null : Period.between(birth, LocalDate.now()).getYears(); }
    private static String name(User u) { return ((u.getFirstName() == null ? "" : u.getFirstName()) + " " + (u.getLastName() == null ? "" : u.getLastName())).trim(); }
    private static String org(User u) { return u.getAgency() == null ? null : u.getAgency().getName(); }
}
