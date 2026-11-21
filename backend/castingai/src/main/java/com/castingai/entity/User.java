package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * User entity — implements UserDetails for Spring Security integration.
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String password;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name", nullable = false)
    private String lastName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(nullable = false)
    private boolean enabled;

    /** T-157 · Compte professionnel inscrit seul : en attente de la validation de l'administrateur. */
    @Column(name = "pending_approval", nullable = false)
    @Builder.Default
    private boolean pendingApproval = false;

    /** Agence cliente de l'agent (null : administrateur de la plateforme, ou acteur). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agency_id")
    private Agency agency;

    /** Assistante de production : autorisations données par le producer (PROJETS, INVITATIONS, EQUIPE, ROOM, CASTING). */
    @Column(name = "assistant_perms", length = 200)
    private String assistantPerms;

    /** LOCAL, GOOGLE ou FACEBOOK. */
    @Builder.Default
    @Column(name = "auth_provider", nullable = false, length = 20)
    private String authProvider = "LOCAL";

    /** Identifiant du compte chez le fournisseur (Google « sub », Facebook « id »). */
    @Column(name = "provider_id", length = 160)
    private String providerId;

    /** T-113 · Adresse e-mail vérifiée (lien de l'administrateur, ou connexion Google / Facebook). */
    @Column(name = "email_verified_at")
    private LocalDateTime emailVerifiedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (authProvider == null) authProvider = "LOCAL";
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() { return true; }

    @Override
    public boolean isAccountNonLocked() { return true; }

    @Override
    public boolean isCredentialsNonExpired() { return true; }

    /** Autorisations de l'assistante. */
    public static final java.util.List<String> PERMS = java.util.List.of("PROJETS", "INVITATIONS", "EQUIPE", "ROOM", "CASTING");

    /** L'admin et le producer peuvent tout ; l'assistante, ce que le producer lui autorise ; les autres, rien côté production. */
    public boolean can(String perm) {
        if (role == Role.ADMIN || role == Role.BOITE_PROD) return true;
        if (role != Role.ASSISTANT_PROD || assistantPerms == null) return false;
        return java.util.Arrays.asList(assistantPerms.split(",")).contains(perm);
    }

    public java.util.List<String> perms() {
        if (role == Role.ADMIN || role == Role.BOITE_PROD) return PERMS;
        if (role != Role.ASSISTANT_PROD || assistantPerms == null || assistantPerms.isBlank()) return java.util.List.of();
        return java.util.Arrays.stream(assistantPerms.split(",")).filter(PERMS::contains).toList();
    }
}
